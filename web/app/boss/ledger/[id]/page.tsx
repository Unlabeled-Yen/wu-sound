import { redirect } from 'next/navigation';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { LedgerEntry } from '@/lib/types';
import LedgerForm from '../LedgerForm';

export const dynamic = 'force-dynamic';

export default async function EditLedgerPage(
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from('ledger_entries').select('*').eq('id', id).maybeSingle();
  if (error || !data) redirect('/boss/ledger');
  const row = data as LedgerEntry;
  const locked = Boolean(row.source_batch_id);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold" style={{ color: 'var(--nm-text-primary)' }}>編輯帳目</h1>
      <LedgerForm mode="edit" initial={row} locked={locked} />
    </div>
  );
}
