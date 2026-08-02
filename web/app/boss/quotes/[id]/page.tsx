import { redirect } from 'next/navigation';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { Quote, QuoteLine } from '@/lib/types';
import QuoteEditor from './QuoteEditor';

export const dynamic = 'force-dynamic';

export default async function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = getSupabaseAdmin();

  const q = await sb.from('quotes').select('*').eq('id', id).maybeSingle();
  if (q.error || !q.data) redirect('/boss/quotes');
  const quote = q.data as Quote;

  const l = await sb
    .from('quote_lines')
    .select('*')
    .eq('quote_id', id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  const lines = (l.data ?? []) as QuoteLine[];

  const catalogIds = Array.from(new Set(lines.map((ln) => ln.catalog_item_id).filter((v): v is string => Boolean(v))));
  const costByItemId: Record<string, number | null> = {};
  if (catalogIds.length > 0) {
    const c = await sb.from('catalog_items').select('id, cost_price_twd').in('id', catalogIds);
    for (const row of (c.data ?? []) as { id: string; cost_price_twd: number | null }[]) {
      costByItemId[row.id] = row.cost_price_twd;
    }
  }

  return <QuoteEditor quote={quote} initialLines={lines} initialCostByItemId={costByItemId} />;
}
