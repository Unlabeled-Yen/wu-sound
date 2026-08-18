import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { can } from '@/lib/acl';
import { getSupabaseAdmin } from '@/lib/supabase';
import { suggestQuoteLines, type CatalogHint } from '@/lib/ai-quote';
import type { CatalogItem, QuoteLine } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

function matchCatalog(name: string, catalog: CatalogItem[]): CatalogItem | null {
  const exact = catalog.find((c) => c.name === name);
  if (exact) return exact;
  const lower = name.toLowerCase();
  const contains = catalog.find(
    (c) => c.name.toLowerCase().includes(lower) || lower.includes(c.name.toLowerCase()),
  );
  return contains ?? null;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });
  if (!can(session.role, 'quotes')) return NextResponse.json({ error: '權限不足' }, { status: 403 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: '無效的請求' }, { status: 400 });
  }
  const needText = typeof body.need_text === 'string' ? body.need_text.trim() : '';
  if (!needText) return NextResponse.json({ error: '請輸入需求描述' }, { status: 400 });

  const sb = getSupabaseAdmin();

  const q = await sb.from('quotes').select('id').eq('id', id).maybeSingle();
  if (q.error) return NextResponse.json({ error: `查詢失敗: ${q.error.message}` }, { status: 500 });
  if (!q.data) return NextResponse.json({ error: '找不到報價單' }, { status: 404 });

  // a. 取用品項庫(含 id + sell_price,但不送價格給 AI)
  const cat = await sb
    .from('catalog_items')
    .select('id, brand, name, item_type, unit, category, sell_price_twd')
    .eq('active', true);
  if (cat.error) return NextResponse.json({ error: `查詢失敗: ${cat.error.message}` }, { status: 500 });
  const catalog = (cat.data ?? []) as CatalogItem[];
  const hints: CatalogHint[] = catalog.map((c) => ({
    name: c.name,
    brand: c.brand,
    item_type: c.item_type,
    category: c.category,
  }));

  // b. 呼叫 AI
  const result = await suggestQuoteLines(needText, hints);
  // c. 失敗 loud
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  // 目前明細最大 sort_order,新行接在後面
  const existing = await sb
    .from('quote_lines')
    .select('sort_order')
    .eq('quote_id', id)
    .order('sort_order', { ascending: false })
    .limit(1);
  let sortOrder = existing.data && existing.data.length > 0 ? (existing.data[0].sort_order as number) + 1 : 0;

  // d. 逐行對應品項庫,建立 quote_lines
  const toInsert = result.lines.map((line) => {
    const matched = matchCatalog(line.catalog_name, catalog);
    const row = matched
      ? {
          quote_id: id,
          catalog_item_id: matched.id,
          name: matched.name,
          spec: line.spec ?? null,
          qty: line.qty,
          unit: matched.unit,
          unit_price_twd: matched.sell_price_twd,
          is_ai_suggested: true,
          sort_order: sortOrder,
        }
      : {
          quote_id: id,
          catalog_item_id: null,
          name: line.catalog_name,
          spec: line.spec ?? null,
          qty: line.qty,
          unit: null,
          unit_price_twd: null,
          is_ai_suggested: true,
          sort_order: sortOrder,
        };
    sortOrder += 1;
    return row;
  });

  const ins = await sb.from('quote_lines').insert(toInsert).select('*');
  if (ins.error) return NextResponse.json({ error: `寫入明細失敗: ${ins.error.message}` }, { status: 500 });
  const createdLines = (ins.data ?? []) as QuoteLine[];

  // e. 存 need_text + ai_rationale
  const upd = await sb
    .from('quotes')
    .update({ need_text: needText, ai_rationale: result.rationale || null })
    .eq('id', id);
  if (upd.error) return NextResponse.json({ error: `更新報價單失敗: ${upd.error.message}` }, { status: 500 });

  const missing = createdLines.filter((l) => l.unit_price_twd === null).length;

  // f. audit
  await sb.from('audit_log').insert({
    actor_id: session.id,
    action: 'quote.ai_suggest',
    target_table: 'quotes',
    target_id: id,
    diff: { need_text: needText, line_count: createdLines.length, missing_price_count: missing },
  });

  return NextResponse.json({
    lines: createdLines,
    rationale: result.rationale,
    missing_price_count: missing,
  });
}
