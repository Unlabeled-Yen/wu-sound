import { getSupabaseAdmin } from '@/lib/supabase';
import BossMobileDashboard from './BossMobileDashboard';
import { taipeiCurrentMonthStr } from '@/lib/tz';
import { summarizeEntries } from '@/lib/ledger-summary';
import { getSession } from '@/lib/session';

// 總覽 v2(13a)桌機版重新規劃暫緩(2026-08-15 Yen 決定)——桌機先放「即將推出」
// 占位畫面。OverviewDesktop.tsx / lib/overview-data.ts 兩支既有實作保留在
// 專案裡但不掛上這個頁面,之後真的要重新規劃時可能還用得上,不要刪掉。
//
// 手機版總覽(BossMobileDashboard)全部是財務/營運數字,員工不得看——這支
// 元件本來假設只有老闆會走到「真手機寬度」,員工手機版解鎖後(見
// lib/view-mode.ts)這個假設不再成立。員工在這裡看到的是跟桌機版一樣的
// 占位卡,不是刪掉手機版總覽,是等真的重新規劃時比照桌機版依角色/能力
// 出卡片。

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

function ComingSoonCard({ subtitle }: { subtitle: string }) {
  return (
    <div className="flex items-center justify-center" style={{ minHeight: '60vh' }}>
      <div
        className="rounded-2xl px-10 py-8 text-center"
        style={{ border: '1px solid rgba(255,255,255,.09)', background: 'rgba(8,8,10,.4)' }}
      >
        <div className="text-[15px] font-medium mb-2" style={{ color: 'var(--nm-text-primary)' }}>總覽即將推出</div>
        <div className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>{subtitle}</div>
      </div>
    </div>
  );
}

export default async function BossDashboard() {
  const session = await getSession();

  // 桌機版兩個角色都還是占位卡(13a 重新規劃暫緩)。手機版只有老闆能看
  // BossMobileDashboard 的財務數字,員工在手機寬度下也是占位卡。
  if (session?.role !== 'boss') {
    return (
      <>
        <div className="lg:hidden"><ComingSoonCard subtitle="手機版總覽正在重新規劃中" /></div>
        <div className="hidden lg:block"><ComingSoonCard subtitle="桌機版總覽正在重新規劃中" /></div>
      </>
    );
  }

  const s = await loadMobileStats();
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

      {/* Desktop view — 總覽重新規劃暫緩,先放占位畫面 */}
      <div className="hidden lg:block"><ComingSoonCard subtitle="桌機版總覽正在重新規劃中" /></div>
    </>
  );
}
