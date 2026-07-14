import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { CatalogItem, QuoteLine, QuoteLineSection } from '@/lib/types';

export const runtime = 'nodejs';

const VALID_SECTIONS: QuoteLineSection[] = ['器材', '安裝'];

function parseQty(v: unknown): number | 'invalid' {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) return 'invalid';
  return n;
}

function parsePrice(v: unknown): number | null | 'invalid' {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) return 'invalid';
  return n;
}

function parseSection(v: unknown): QuoteLineSection | 'invalid' {
  if (!VALID_SECTIONS.includes(v as QuoteLineSection)) return 'invalid';
  return v as QuoteLineSection;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });
  if (session.role !== 'boss') return NextResponse.json({ error: '權限不足' }, { status: 403 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });

  let body: { action?: string; line?: Record<string, unknown> };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: '無效的請求' }, { status: 400 });
  }
  const action = body.action;
  const line = body.line ?? {};

  const sb = getSupabaseAdmin();
  const q = await sb.from('quotes').select('id').eq('id', id).maybeSingle();
  if (q.error) return NextResponse.json({ error: `查詢失敗: ${q.error.message}` }, { status: 500 });
  if (!q.data) return NextResponse.json({ error: '找不到報價單' }, { status: 404 });

  if (action === 'add') {
    const catalogItemId = typeof line.catalog_item_id === 'string' ? line.catalog_item_id : null;

    let name = typeof line.name === 'string' ? line.name.trim() : '';
    let unit: string | null = typeof line.unit === 'string' && line.unit.trim() ? line.unit.trim() : null;
    let price = parsePrice(line.unit_price_twd);
    if (price === 'invalid') return NextResponse.json({ error: '單價必須是 0 或正整數' }, { status: 400 });

    // 從品項庫加一項:用品項庫快照覆蓋 name/unit/price
    if (catalogItemId) {
      const ci = await sb.from('catalog_items').select('*').eq('id', catalogItemId).maybeSingle();
      if (ci.error) return NextResponse.json({ error: `查詢失敗: ${ci.error.message}` }, { status: 500 });
      if (!ci.data) return NextResponse.json({ error: '找不到品項' }, { status: 404 });
      const c = ci.data as CatalogItem;
      name = c.name;
      unit = c.unit;
      price = c.sell_price_twd;
    }

    if (!name) return NextResponse.json({ error: '請填品名' }, { status: 400 });

    const qty = parseQty(line.qty ?? 1);
    if (qty === 'invalid') return NextResponse.json({ error: '數量必須是正整數' }, { status: 400 });

    const section = parseSection(line.section ?? '器材');
    if (section === 'invalid') return NextResponse.json({ error: '分區必須是器材或安裝' }, { status: 400 });

    const maxQ = await sb
      .from('quote_lines')
      .select('sort_order')
      .eq('quote_id', id)
      .order('sort_order', { ascending: false })
      .limit(1);
    const sortOrder = maxQ.data && maxQ.data.length > 0 ? (maxQ.data[0].sort_order as number) + 1 : 0;

    const ins = await sb
      .from('quote_lines')
      .insert({
        quote_id: id,
        catalog_item_id: catalogItemId,
        name,
        spec: typeof line.spec === 'string' && line.spec.trim() ? line.spec.trim() : null,
        qty,
        unit,
        unit_price_twd: price,
        section,
        is_ai_suggested: false,
        sort_order: sortOrder,
      })
      .select('*')
      .single();
    if (ins.error || !ins.data) {
      return NextResponse.json({ error: `新增失敗: ${ins.error?.message ?? 'unknown'}` }, { status: 500 });
    }

    await sb.from('audit_log').insert({
      actor_id: session.id,
      action: 'quote.line_add',
      target_table: 'quote_lines',
      target_id: ins.data.id,
      diff: { quote_id: id, after: ins.data },
    });
    return NextResponse.json({ line: ins.data as QuoteLine });
  }

  if (action === 'update') {
    const lineId = typeof line.id === 'string' ? line.id : '';
    if (!lineId) return NextResponse.json({ error: '缺少明細 id' }, { status: 400 });

    const cur = await sb.from('quote_lines').select('*').eq('id', lineId).eq('quote_id', id).maybeSingle();
    if (cur.error) return NextResponse.json({ error: `查詢失敗: ${cur.error.message}` }, { status: 500 });
    if (!cur.data) return NextResponse.json({ error: '找不到明細' }, { status: 404 });
    const before = cur.data as QuoteLine;

    const patch: Record<string, unknown> = {};
    if ('name' in line) {
      const nm = typeof line.name === 'string' ? line.name.trim() : '';
      if (!nm) return NextResponse.json({ error: '品名不可為空' }, { status: 400 });
      patch.name = nm;
    }
    if ('spec' in line) patch.spec = typeof line.spec === 'string' && line.spec.trim() ? line.spec.trim() : null;
    if ('unit' in line) patch.unit = typeof line.unit === 'string' && line.unit.trim() ? line.unit.trim() : null;
    if ('qty' in line) {
      const qv = parseQty(line.qty);
      if (qv === 'invalid') return NextResponse.json({ error: '數量必須是正整數' }, { status: 400 });
      patch.qty = qv;
    }
    if ('unit_price_twd' in line) {
      const pv = parsePrice(line.unit_price_twd);
      if (pv === 'invalid') return NextResponse.json({ error: '單價必須是 0 或正整數' }, { status: 400 });
      patch.unit_price_twd = pv;
    }
    if ('sort_order' in line) {
      const sv = Number(line.sort_order);
      if (!Number.isInteger(sv)) return NextResponse.json({ error: '排序必須是整數' }, { status: 400 });
      patch.sort_order = sv;
    }
    if ('section' in line) {
      const sec = parseSection(line.section);
      if (sec === 'invalid') return NextResponse.json({ error: '分區必須是器材或安裝' }, { status: 400 });
      patch.section = sec;
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: '沒有可更新的欄位' }, { status: 400 });
    }

    const upd = await sb.from('quote_lines').update(patch).eq('id', lineId).select('*').single();
    if (upd.error || !upd.data) {
      return NextResponse.json({ error: `更新失敗: ${upd.error?.message ?? 'unknown'}` }, { status: 500 });
    }
    await sb.from('audit_log').insert({
      actor_id: session.id,
      action: 'quote.line_update',
      target_table: 'quote_lines',
      target_id: lineId,
      diff: { before, after: upd.data },
    });
    return NextResponse.json({ line: upd.data as QuoteLine });
  }

  if (action === 'delete') {
    const lineId = typeof line.id === 'string' ? line.id : '';
    if (!lineId) return NextResponse.json({ error: '缺少明細 id' }, { status: 400 });
    const cur = await sb.from('quote_lines').select('*').eq('id', lineId).eq('quote_id', id).maybeSingle();
    if (cur.error) return NextResponse.json({ error: `查詢失敗: ${cur.error.message}` }, { status: 500 });
    if (!cur.data) return NextResponse.json({ error: '找不到明細' }, { status: 404 });

    const del = await sb.from('quote_lines').delete().eq('id', lineId);
    if (del.error) return NextResponse.json({ error: `刪除失敗: ${del.error.message}` }, { status: 500 });

    await sb.from('audit_log').insert({
      actor_id: session.id,
      action: 'quote.line_delete',
      target_table: 'quote_lines',
      target_id: lineId,
      diff: { before: cur.data },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: '不支援的動作' }, { status: 400 });
}
