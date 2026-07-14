import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { Quote, QuoteLine } from '@/lib/types';

export const runtime = 'nodejs';

export interface QuoteSummary extends Quote {
  line_count: number;
  missing_price_count: number;
  total_twd: number | null; // null = 尚有待補價,不出總數
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });
  if (session.role !== 'boss') return NextResponse.json({ error: '權限不足' }, { status: 403 });

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
  if (session.role !== 'boss') return NextResponse.json({ error: '權限不足' }, { status: 403 });

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

  const sb = getSupabaseAdmin();
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

  await sb.from('audit_log').insert({
    actor_id: session.id,
    action: 'quote.create',
    target_table: 'quotes',
    target_id: ins.data.id,
    diff: { after: ins.data },
  });

  return NextResponse.json({ quote: ins.data });
}
