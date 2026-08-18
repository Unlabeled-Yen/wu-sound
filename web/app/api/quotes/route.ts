import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { can } from '@/lib/acl';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { BundleLine, BundleTemplate, CatalogItem, Quote, QuoteLine } from '@/lib/types';

export const runtime = 'nodejs';

export interface QuoteSummary extends Quote {
  line_count: number;
  missing_price_count: number;
  total_twd: number | null; // null = 尚有待補價,不出總數
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });
  if (!can(session.role, 'quotes')) return NextResponse.json({ error: '權限不足' }, { status: 403 });

  const sb = getSupabaseAdmin();
  const { data: quotes, error } = await sb
    .from('quotes')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: `查詢失敗: ${error.message}` }, { status: 500 });

  const rows = (quotes ?? []) as Quote[];
  const ids = rows.map((q) => q.id);
  const byQuote = new Map<string, QuoteLine[]>();
  if (ids.length > 0) {
    const { data: lines, error: le } = await sb
      .from('quote_lines')
      .select('*')
      .in('quote_id', ids);
    if (le) return NextResponse.json({ error: `查詢失敗: ${le.message}` }, { status: 500 });
    for (const l of (lines ?? []) as QuoteLine[]) {
      const arr = byQuote.get(l.quote_id) ?? [];
      arr.push(l);
      byQuote.set(l.quote_id, arr);
    }
  }

  const summaries: QuoteSummary[] = rows.map((qte) => {
    const lines = byQuote.get(qte.id) ?? [];
    let missing = 0;
    let total = 0;
    for (const l of lines) {
      if (l.unit_price_twd === null || l.unit_price_twd === undefined) missing += 1;
      else total += l.qty * l.unit_price_twd;
    }
    return {
      ...qte,
      line_count: lines.length,
      missing_price_count: missing,
      total_twd: missing > 0 ? null : total,
    };
  });

  return NextResponse.json({ quotes: summaries });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });
  if (!can(session.role, 'quotes')) return NextResponse.json({ error: '權限不足' }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: '無效的請求' }, { status: 400 });
  }

  const clientName = typeof body.client_name === 'string' ? body.client_name.trim() : '';
  if (!clientName) return NextResponse.json({ error: '請填客戶名稱' }, { status: 400 });
  const projectName = typeof body.project_name === 'string' && body.project_name.trim()
    ? body.project_name.trim()
    : null;
  const bundleId = typeof body.bundle_id === 'string' && body.bundle_id.trim()
    ? body.bundle_id.trim()
    : null;

  const sb = getSupabaseAdmin();

  // 若指定 bundle:先驗證存在且 active,並抓 bundle_lines + catalog 價格快照
  let bundle: BundleTemplate | null = null;
  let bundleLines: BundleLine[] = [];
  const priceByCatalogId = new Map<string, number | null>();
  if (bundleId) {
    const bq = await sb.from('bundle_templates').select('*').eq('id', bundleId).maybeSingle();
    if (bq.error) return NextResponse.json({ error: `查詢失敗: ${bq.error.message}` }, { status: 500 });
    if (!bq.data) return NextResponse.json({ error: '找不到套組' }, { status: 400 });
    bundle = bq.data as BundleTemplate;
    if (!bundle.active) return NextResponse.json({ error: '此套組已停用,無法使用' }, { status: 400 });

    const lq = await sb
      .from('bundle_lines')
      .select('*')
      .eq('bundle_id', bundleId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (lq.error) return NextResponse.json({ error: `查詢失敗: ${lq.error.message}` }, { status: 500 });
    bundleLines = (lq.data ?? []) as BundleLine[];

    const catalogIds = Array.from(new Set(
      bundleLines.map((l) => l.catalog_item_id).filter((v): v is string => !!v),
    ));
    if (catalogIds.length > 0) {
      const cq = await sb.from('catalog_items').select('id,sell_price_twd').in('id', catalogIds);
      if (cq.error) return NextResponse.json({ error: `查詢失敗: ${cq.error.message}` }, { status: 500 });
      for (const c of ((cq.data ?? []) as Pick<CatalogItem, 'id' | 'sell_price_twd'>[])) {
        priceByCatalogId.set(c.id, c.sell_price_twd);
      }
    }
  }

  const ins = await sb
    .from('quotes')
    .insert({
      client_name: clientName,
      project_name: projectName,
      status: 'draft',
      created_by: session.id,
    })
    .select('*')
    .single();

  if (ins.error || !ins.data) {
    return NextResponse.json({ error: `新增失敗: ${ins.error?.message ?? 'unknown'}` }, { status: 500 });
  }
  const newQuote = ins.data as Quote;

  await sb.from('audit_log').insert({
    actor_id: session.id,
    action: 'quote.create',
    target_table: 'quotes',
    target_id: newQuote.id,
    diff: { after: newQuote },
  });

  // materialize bundle_lines → quote_lines
  if (bundle && bundleLines.length > 0) {
    const rows = bundleLines.map((l, i) => ({
      quote_id: newQuote.id,
      catalog_item_id: l.catalog_item_id,
      name: l.name,
      spec: l.spec,
      qty: l.qty,
      unit: l.unit,
      unit_price_twd: l.catalog_item_id ? (priceByCatalogId.get(l.catalog_item_id) ?? null) : null,
      is_ai_suggested: false,
      section: l.section,
      sort_order: i,
    }));
    const li = await sb.from('quote_lines').insert(rows).select('id');
    if (li.error) {
      return NextResponse.json({ error: `套組展開失敗: ${li.error.message}` }, { status: 500 });
    }
    await sb.from('audit_log').insert({
      actor_id: session.id,
      action: 'quote.create_from_bundle',
      target_table: 'quotes',
      target_id: newQuote.id,
      diff: { bundle_id: bundle.id, bundle_name: bundle.name, line_count: rows.length },
    });
  }

  return NextResponse.json({ quote: newQuote });
}
