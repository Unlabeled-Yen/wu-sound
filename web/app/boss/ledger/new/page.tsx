import LedgerForm from '../LedgerForm';
import { JOURNAL_KINDS, type LedgerJournal } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function NewLedgerPage(
  { searchParams }: { searchParams: Promise<{ month?: string; journal?: string }> },
) {
  const sp = (await searchParams) ?? {};
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : undefined;
  const journal = sp.journal && sp.journal in JOURNAL_KINDS ? (sp.journal as LedgerJournal) : undefined;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold" style={{ color: 'var(--nm-text-primary)' }}>新增一筆帳目</h1>
      <LedgerForm mode="create" defaultMonth={month} defaultJournal={journal} />
    </div>
  );
}
