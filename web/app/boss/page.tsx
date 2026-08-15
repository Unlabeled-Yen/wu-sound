import { getSupabaseAdmin } from '@/lib/supabase';
import BossMobileDashboard from './BossMobileDashboard';
import { OverviewDesktop } from './OverviewDesktop';
import { taipeiCurrentMonthStr } from '@/lib/tz';
import { summarizeEntries } from '@/lib/ledger-summary';
import { loadOverviewData } from '@/lib/overview-data';

export const dynamic = 'force-dynamic';

function currentMonth(): string {
  return taipeiCurrentMonthStr();
}

function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const from = `${month}-01`;
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const to = `${nextY}-${String(nextM).padStart(2, '0')}-01`;
  return { from, to };
}

// 手機版總覽(BossMobileDashboard.tsx)這一輪不動,沿用既有的財務+業務統計口徑。
async function loadMobileStats() {
  const sb = getSupabaseAdmin();
  const month = currentMonth();
  const { from, to } = monthRange(month);

  const [ledgerRes, expensesRes, draftsRes, monthExpensesRes, quotesRes, equipmentRes] = await Promise.all([
    sb
      .from('ledger_entries')
      .select('direction, amount_twd, fee_twd')
      .eq('state', 'posted')
      .gte('occurred_on', from)
      .lt('occurred_on', to),
    sb.from('expenses').select('id, amount_twd, users!inner(id)').eq('status', 'submitted'),
    sb.from('expenses').select('id, users!inner(id)').eq('status', 'draft'),
    sb.from('expenses').select('id, status, spent_on, captured_at').in('status', ['draft', 'submitted']),
    sb.from('quotes').select('id, status').in('status', ['draft', 'sent']),
    sb.from('equipment').select('id').eq('status', 'in_repair'),
  ]);

  const ledgerRows = ledgerRes.data ?? [];
  const { income, expense, net } = summarizeEntries(ledgerRows);

  const pendingExpense = expensesRes.data ?? [];
  const pendingCount = pendingExpense.length;
  const pendingAmount = pendingExpense.reduce((s, r) => s + (r.amount_twd ?? 0), 0);
  const draftCount = (draftsRes.data ?? []).length;

  const closeBlockedCount = (monthExpensesRes.data ?? []).filter((r) => {
    const src = (r.spent_on ?? r.captured_at) as string;
    return String(src).slice(0, 7) === month;
  }).length;

  const quoteRows = quotesRes.data ?? [];
  const quoteDraft = quoteRows.filter((r) => r.status === 'draft').length;
  const quoteSent = quoteRows.filter((r) => r.status === 'sent').length;

  const repairCount = (equipmentRes.data ?? []).length;

  return {
    month,
    income,
    expense,
    net,
    pendingCount,
    pendingAmount,
    draftCount,
    closeBlockedCount,
    quoteDraft,
    quoteSent,
    repairCount,
    errors: {
      ledger: ledgerRes.error?.message,
      expenses: expensesRes.error?.message,
      monthExpenses: monthExpensesRes.error?.message,
      quotes: quotesRes.error?.message,
      equipment: equipmentRes.error?.message,
    },
  };
}

export default async function BossDashboard() {
  const [s, overview] = await Promise.all([loadMobileStats(), loadOverviewData()]);
  const anyError = Object.values(s.errors).some(Boolean);

  return (
    <>
      {/* Mobile-only view(不動) */}
      <div className="lg:hidden">
        {anyError && (
          <div
            className="rounded-xl p-4 text-[13px] nm-inset mb-4"
            style={{ color: 'var(--nm-danger)' }}
          >
            部分資料讀取失敗
          </div>
        )}
        <BossMobileDashboard s={s} />
      </div>

      {/* Desktop view — 總覽 v2(13a) */}
      <div className="hidden lg:block">
        <OverviewDesktop data={overview} month={s.month} />
      </div>
    </>
  );
}
