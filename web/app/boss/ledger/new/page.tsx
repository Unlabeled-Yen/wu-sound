import LedgerForm from '../LedgerForm';

export const dynamic = 'force-dynamic';

export default async function NewLedgerPage(
  { searchParams }: { searchParams: Promise<{ month?: string }> },
) {
  const sp = (await searchParams) ?? {};
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : undefined;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold" style={{ color: 'var(--nm-text-primary)' }}>新增一筆帳目</h1>
      <LedgerForm mode="create" defaultMonth={month} />
    </div>
  );
}
