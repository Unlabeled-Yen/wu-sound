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

  return <QuoteEditor quote={quote} initialLines={lines} />;
}
