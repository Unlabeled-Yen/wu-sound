import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin, RECEIPTS_BUCKET } from '@/lib/supabase';
import type { ExpenseRecord } from '@/lib/types';
import ConfirmForm from './ConfirmForm';

export const dynamic = 'force-dynamic';

interface Site {
  id: string;
  name: string;
}

export default async function StaffQueueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect('/login');

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('expenses')
    .select('*')
    .eq('id', id)
    .eq('user_id', session.id)
    .maybeSingle();
  if (error) {
    throw new Error(`Supabase 查詢失敗: ${error.message}`);
  }
  if (!data) notFound();
  const row = data as ExpenseRecord;
  if (row.status !== 'draft') {
    redirect('/staff/queue');
  }

  let receiptUrl: string | null = null;
  if (row.receipt_url) {
    const { data: signed } = await sb.storage
      .from(RECEIPTS_BUCKET)
      .createSignedUrl(row.receipt_url, 300);
    receiptUrl = signed?.signedUrl ?? null;
  }

  const { data: siteRows } = await sb
    .from('sites')
    .select('id, name')
    .eq('active', true)
    .order('name', { ascending: true });
  const sites: Site[] = (siteRows ?? []) as Site[];

  return (
    <div className="max-w-lg mx-auto px-4 py-5">
      <ConfirmForm row={row} receiptUrl={receiptUrl} sites={sites} />
    </div>
  );
}
