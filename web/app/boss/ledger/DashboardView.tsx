import { type LedgerEntry } from '@/lib/types';
import { summarizeEntries } from '@/lib/ledger-summary';
import { fetchReceivablesWithRemaining } from '@/lib/receivables-query';
import { buildCashForecast, type ForecastReceivable } from '@/lib/ledger-cash-forecast';
import { generateLedgerInsight, buildLedgerInsightTodo, buildLedgerInsightChange, buildLedgerInsightLink } from '@/lib/ledger-insight';
import { taipeiTodayStr } from '@/lib/tz';
import { getSupabaseAdmin } from '@/lib/supabase';
import { NetBand } from './NetBand';
import { rankTop3 } from './ColumnHeader';
import { CashForecastTimeline } from './CashForecastTimeline';
import { AiInsightCard } from './AiInsightCard';

// 帳務首頁的「金流監測」分頁:全帳戶最新監測狀態,不受月份/篩選影響
// (淨額帶、未來四週現金、收支分析)。原本這裡下面還接著「本月已收付明細」,
// v3 把那段併進「已收付」分頁(已經有自己的篩選/編輯/作廢,不重複造一份)——
// 這裡現在純粹是「現在金流是什麼狀況」,不含任何可編輯操作。
// 見 docs/ledger-home-v2-spec.md §2(監測帶/列表分離的原始設計理由仍然成立,
// 只是列表搬去別的分頁,不是留在這裡)。
export async function DashboardView({
  sb, toCheckCount, toIssueCount,
}: {
  sb: ReturnType<typeof getSupabaseAdmin>;
  toCheckCount: number;
  toIssueCount: number;
}) {
  const [monitorEntriesRes, monitorReceivablesRes, receivableCreatedAtRes] = await Promise.all([
    sb.from('ledger_entries').select('*').eq('state', 'posted'),
    fetchReceivablesWithRemaining(sb, { status: 'open' }),
    // 「變化」分頁的平均收款天數要用——不分開/結清狀態,全部應收約定的建立時間都要。
    sb.from('receivables').select('id, created_at').eq('direction', 'receivable'),
  ]);

  if (monitorEntriesRes.error || monitorReceivablesRes.error || receivableCreatedAtRes.error) {
    return (
      <div className="rounded-2xl px-4 py-3 text-[13px]" style={{ background: 'rgba(224,122,122,0.08)', border: '1px solid rgba(224,122,122,0.34)', color: 'var(--nm-danger-glass-text)' }}>
        讀取失敗,以下數字不可信:{monitorEntriesRes.error?.message ?? monitorReceivablesRes.error ?? receivableCreatedAtRes.error?.message}
      </div>
    );
  }

  const monitorEntries = (monitorEntriesRes.data ?? []) as LedgerEntry[];
  const receivables = monitorReceivablesRes.rows;
  const monitorIncomeEntries = monitorEntries.filter((r) => r.direction === 'income');
  const monitorExpenseEntries = monitorEntries.filter((r) => r.direction === 'expense');
  const openReceivables = receivables.filter((r) => r.direction === 'receivable');
  const openPayables = receivables.filter((r) => r.direction === 'payable');

  const { feeTotal } = summarizeEntries(monitorEntries);
  const incomeSettled = monitorIncomeEntries.reduce((s, r) => s + r.amount_twd, 0);
  const expenseSettled = monitorExpenseEntries.reduce((s, r) => s + r.amount_twd, 0);
  const incomeUnsettled = openReceivables.reduce((s, r) => s + Math.max(0, r.remaining_twd), 0);
  const expenseUnsettled = openPayables.reduce((s, r) => s + Math.max(0, r.remaining_twd), 0);
  const incomeFace = incomeSettled + incomeUnsettled;
  const expenseFace = expenseSettled + expenseUnsettled;
  const netFace = incomeFace - expenseFace;
  const netSettled = incomeSettled - expenseSettled - feeTotal;

  // 收入排行按專案,供收支分析的「收入主要來自哪」用——全帳戶口徑,跟監測帶其他數字一致。
  const incomeBySite = new Map<string, { label: string; amount: number }>();
  const addSite = (id: string | null, name: string | undefined, amt: number) => {
    const key = id ?? '__none__';
    const cur = incomeBySite.get(key) ?? { label: id ? (name ?? '?') : '專案外', amount: 0 };
    cur.amount += amt;
    incomeBySite.set(key, cur);
  };
  monitorIncomeEntries.forEach((r) => addSite(r.site_id, undefined, r.amount_twd));
  openReceivables.forEach((r) => addSite(r.site_id, r.sites?.name, Math.max(0, r.remaining_twd)));
  const incomeRanking = rankTop3(incomeBySite);

  const forecastRows: ForecastReceivable[] = [...openReceivables, ...openPayables].map((r) => ({
    direction: r.direction,
    remaining_twd: r.remaining_twd,
    agreed_due_date: r.agreed_due_date,
    label: r.party + (r.sites?.name ? `（${r.sites.name}）` : ''),
    overdue: !!(r.agreed_due_date && r.agreed_due_date < taipeiTodayStr()),
  }));

  const settingsRes = await sb.from('app_settings').select('key, value').in('key', ['cash_start_balance', 'cash_safety_level']);
  const settingsMap = new Map((settingsRes.data ?? []).map((s: { key: string; value: string }) => [s.key, s.value]));
  const cashStartBalance = Number(settingsMap.get('cash_start_balance') ?? '0');
  const cashSafetyLevel = Number(settingsMap.get('cash_safety_level') ?? '150000');

  const forecast = buildCashForecast(forecastRows, taipeiTodayStr(), cashStartBalance);

  const overdueReceivables = openReceivables.filter((r) => r.agreed_due_date && r.agreed_due_date < taipeiTodayStr() && r.remaining_twd > 0);
  const insight = generateLedgerInsight({
    month: 'all',
    entryCount: monitorEntries.length,
    unsettledCount: openReceivables.length + openPayables.length,
    incomeFace,
    expenseFace,
    netFace,
    netSettled,
    overdueIncomeTwd: overdueReceivables.reduce((s, r) => s + r.remaining_twd, 0),
    overdueIncomeCount: overdueReceivables.length,
    toCheckCount,
    toIssueCount,
    topIncomeLabel: incomeRanking[0]?.label ?? null,
    topIncomeAmount: incomeRanking[0]?.amount ?? 0,
  });

  const missingCustomerAmount = monitorIncomeEntries
    .filter((r) => !r.party)
    .reduce((max, r) => Math.max(max, r.amount_twd), 0);
  const todo = buildLedgerInsightTodo({
    netFace,
    netSettled,
    incomeUnsettled,
    expenseUnsettled,
    missingCustomerAmount: missingCustomerAmount > 0 ? missingCustomerAmount : null,
    agingRows: [...openReceivables, ...openPayables].map((r) => ({ agreedDueDate: r.agreed_due_date })),
    todayStr: taipeiTodayStr(),
  });

  const receivableCreatedAtById = new Map((receivableCreatedAtRes.data ?? []).map((r: { id: string; created_at: string }) => [r.id, r.created_at]));
  const settledOnByReceivable = new Map<string, string>();
  monitorIncomeEntries
    .filter((r) => r.receivable_id)
    .forEach((r) => {
      const cur = settledOnByReceivable.get(r.receivable_id!);
      if (!cur || r.occurred_on > cur) settledOnByReceivable.set(r.receivable_id!, r.occurred_on);
    });
  const collections = Array.from(settledOnByReceivable.entries())
    .map(([receivableId, settledOn]) => ({ receivableCreatedAt: receivableCreatedAtById.get(receivableId), settledOn }))
    .filter((c): c is { receivableCreatedAt: string; settledOn: string } => !!c.receivableCreatedAt);

  const change = buildLedgerInsightChange({
    entries: monitorEntries.map((r) => ({ occurred_on: r.occurred_on, direction: r.direction, amount_twd: r.amount_twd, fee_twd: r.fee_twd })),
    collections,
    monthsBack: 6,
    todayStr: taipeiTodayStr(),
  });

  const link = buildLedgerInsightLink({
    openPayables: openPayables.map((r) => ({ site_id: r.site_id, siteLabel: r.party + (r.sites?.name ? `（${r.sites.name}）` : ''), agreed_due_date: r.agreed_due_date, remaining_twd: r.remaining_twd })),
    openReceivables: openReceivables.map((r) => ({ site_id: r.site_id, siteLabel: r.party + (r.sites?.name ? `（${r.sites.name}）` : ''), agreed_due_date: r.agreed_due_date, remaining_twd: r.remaining_twd })),
  });

  return (
    <div className="space-y-4 lg:h-full lg:overflow-y-auto lg:pr-1">
      <div>
        <NetBand netFace={netFace} netSettled={netSettled} incomeUnsettled={incomeUnsettled} expenseUnsettled={expenseUnsettled} />
        <div className="text-right text-[11.5px] mt-1.5" style={{ color: 'var(--nm-text-faint)' }}>
          全帳戶即時狀態　·　不受月份影響
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-4">
        <div className="min-w-0">
          <CashForecastTimeline forecast={forecast} startBalance={cashStartBalance} safetyLevel={cashSafetyLevel} />
        </div>
        <div className="min-w-0">
          <AiInsightCard insight={insight} todo={todo} change={change} link={link} />
        </div>
      </div>
    </div>
  );
}
