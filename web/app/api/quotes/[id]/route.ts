import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';
import { QUOTE_STATUS_TRANSITIONS, type Quote, type QuoteLine, type QuoteStatus } from '@/lib/types';

export const runtime = 'nodejs';

const VALID_STATUS: QuoteStatus[] = ['draft', 'sent', 'won', 'lost'];

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });
  if (session.role !== 'boss') return NextResponse.json({ error: '權限不足' }, { status: 403 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });

  const sb = getSupabaseAdmin();
  const q = await sb.from('quotes').select('*').eq('id', id).maybeSingle();
  if (q.error) return NextResponse.json({ error: `查詢失敗: ${q.error.message}` }, { status: 500 });
  if (!q.data) return NextResponse.json({ error: '找不到報價單' }, { status: 404 });

  const l = await sb
    .from('quote_lines')
    .select('*')
    .eq('quote_id', id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (l.error) return NextResponse.json({ error: `查詢失敗: ${l.error.message}` }, { status: 500 });

  return NextResponse.json({ quote: q.data as Quote, lines: (l.data ?? []) as QuoteLine[] });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });
  if (session.role !== 'boss') return NextResponse.json({ error: '權限不足' }, { status: 403 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: '無效的請求' }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const cur = await sb.from('quotes').select('*').eq('id', id).maybeSingle();
  if (cur.error) return NextResponse.json({ error: `查詢失敗: ${cur.error.message}` }, { status: 500 });
  if (!cur.data) return NextResponse.json({ error: '找不到報價單' }, { status: 404 });
  const before = cur.data as Quote;

  const patch: Record<string, unknown> = {};

  if ('client_name' in body) {
    const nm = typeof body.client_name === 'string' ? body.client_name.trim() : '';
    if (!nm) return NextResponse.json({ error: '客戶名稱不可為空' }, { status: 400 });
    patch.client_name = nm;
  }
  if ('project_name' in body) {
    patch.project_name = typeof body.project_name === 'string' && body.project_name.trim()
      ? body.project_name.trim() : null;
  }
  if ('note' in body) {
    patch.note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null;
  }
  if ('site_id' in body) {
    patch.site_id = typeof body.site_id === 'string' && body.site_id ? body.site_id : null;
  }
  if ('tax_rate' in body) {
    const tr = Number(body.tax_rate);
    if (!Number.isFinite(tr) || tr < 0 || tr > 1) {
      return NextResponse.json({ error: '稅率必須是 0 到 1 之間的數字' }, { status: 400 });
    }
    patch.tax_rate = tr;
  }
  if ('status' in body) {
    const st = body.status as QuoteStatus;
    if (!VALID_STATUS.includes(st)) return NextResponse.json({ error: '狀態不正確' }, { status: 400 });
    if (st !== before.status && !QUOTE_STATUS_TRANSITIONS[before.status].includes(st)) {
      return NextResponse.json(
        { error: `不可從「${before.status}」轉移到「${st}」——成交/未成交是終態,要修改請開一張新報價單` },
        { status: 400 },
      );
    }
    if (st === 'sent') {
      // 缺價 loud:任何一行 unit_price 為 null,不可送出
      const lines = await sb.from('quote_lines').select('unit_price_twd').eq('quote_id', id);
      if (lines.error) return NextResponse.json({ error: `查詢失敗: ${lines.error.message}` }, { status: 500 });
      const rows = (lines.data ?? []) as { unit_price_twd: number | null }[];
      const missing = rows.filter((r) => r.unit_price_twd === null || r.unit_price_twd === undefined).length;
      if (rows.length === 0) {
        return NextResponse.json({ error: '報價單沒有任何品項,無法送出' }, { status: 400 });
      }
      if (missing > 0) {
        return NextResponse.json({ error: `尚有 ${missing} 項待設定售價,無法送出` }, { status: 400 });
      }
    }
    patch.status = st;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: '沒有可更新的欄位' }, { status: 400 });
  }

  const upd = await sb.from('quotes').update(patch).eq('id', id).select('*').single();
  if (upd.error || !upd.data) {
    return NextResponse.json({ error: `更新失敗: ${upd.error?.message ?? 'unknown'}` }, { status: 500 });
  }

  await sb.from('audit_log').insert({
    actor_id: session.id,
    action: 'quote.update',
    target_table: 'quotes',
    target_id: id,
    diff: { before, after: upd.data },
  });

  return NextResponse.json({ quote: upd.data });
}
