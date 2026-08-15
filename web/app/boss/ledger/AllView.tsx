import { type LedgerEntry, type LedgerKind, type InvoiceStatus } from '@/lib/types';
import { summarizeEntries } from '@/lib/ledger-summary';
import { fetchReceivablesWithRemaining } from '@/lib/receivables-query';
import { buildCashForecast, type ForecastReceivable } from '@/lib/ledger-cash-forecast';
import { generateLedgerInsight } from '@/lib/ledger-insight';
import { taipeiTodayStr } from '@/lib/tz';
import { getSupabaseAdmin } from '@/lib/supabase';
import Link from 'next/link';
import { buildHref, currentMonth, monthRange, shiftMonth, NO_SITE, type SP } from './ledger-page-helpers';
import { NetBand } from './NetBand';
import { rankTop3 } from './ColumnHeader';
import { CashForecastTimeline } from './CashForecastTimeline';
import { AiInsightCard } from './AiInsightCard';
import { SettledMonthList, type SettledEntry } from './SettledMonthList';
import { IncomeExpenseTabs } from './IncomeExpenseTabs';
import { LedgerFilterBar } from './LedgerFilterBar';

// 帳務首頁(mode=all)v2:上半部是「全帳戶最新監測狀態」,完全不受下方月份/篩選
// 影響(淨額帶、未來四週現金、收支分析);下半部是「該月份的已收付明細」,受
// 月份與篩選影響。兩組資料分開查、分開算,不共用同一份 fetch——這是本輪改版
// 要修的既有缺陷:舊版「帳面淨額」把本月已收跟全帳戶未收加在一起,切月份時
// 只有一半會動,是一個誰都沒發現的語意錯誤。見 docs/ledger-home-v2-spec.md §2。
export async function AllView({
  sb, month, siteId, kind, invoice, toCheckOnly, ext, base, toCheckCount, toIssueCount, sites,
}: {
  sb: ReturnType<typeof getSupabaseAdmin>;
  month: string;
  siteId?: string;
  kind?: LedgerKind;
  invoice?: InvoiceStatus;
  toCheckOnly: boolean;
  ext?: string;
  base: SP;
  toCheckCount: number;
  toIssueCount: number;
  sites: Array<{ id: string; name: string }>;
}) {
  // ---- 監測資料:全帳戶、不受月份/篩選影響 ----
  const [monitorEntriesRes, monitorReceivablesRes] = await Promise.all([
    sb.from('ledger_entries').select('*').eq('state', 'posted'),
    fetchReceivablesWithRemaining(sb, { status: 'open' }),
  ]);

  // ---- 列表資料:受月份與篩選影響,只含已收付分錄(未結約定已搬到應收款/應付款) ----
  let listQuery = sb.from('ledger_entries').select('*, sites(name)').eq('state', 'posted');
  if (month !== 'all') {
    const { from, to } = monthRange(month);
    listQuery = listQuery.gte('occurred_on', from).lte('occurred_on', to);
  }
  if (siteId === NO_SITE) listQuery = listQuery.is('site_id', null);
  else if (siteId) listQuery = listQuery.eq('site_id', siteId);
  if (kind) listQuery = listQuery.eq('kind', kind);
  if (invoice) listQuery = listQuery.eq('invoice_status', invoice);
  if (toCheckOnly) listQuery = listQuery.eq('to_check', true);
  if (ext === 'internal') listQuery = listQuery.eq('is_external', false);
  else if (ext === 'external') listQuery = listQuery.eq('is_external', true);
  listQuery = listQuery.order('occurred_on', { ascending: false }).order('created_at', { ascending: false });
  const listEntriesRes = await listQuery;

  if (monitorEntriesRes.error || monitorReceivablesRes.error || listEntriesRes.error) {
    return (
      <div className="rounded-2xl px-4 py-3 text-[13px]" style={{ background: 'rgba(224,122,122,0.08)', border: '1px solid rgba(224,122,122,0.34)', color: 'var(--nm-danger-glass-text)' }}>
        讀取失敗,以下數字不可信:{monitorEntriesRes.error?.message ?? monitorReceivablesRes.error ?? listEntriesRes.error?.message}
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
    const key = id ?? NO_SITE;
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

  // ---- 列表資料整理(本月/篩選後的已收付) ----
  type Row = LedgerEntry & { sites?: { name: string } | null };
  const listEntries = (listEntriesRes.data ?? []) as Row[];
  const listIncome: SettledEntry[] = listEntries.filter((r) => r.direction === 'income');
  const listExpense: SettledEntry[] = listEntries.filter((r) => r.direction === 'expense');
  const listIncomeTotal = listIncome.reduce((s, r) => (r.state === 'voided' ? s : s + r.amount_twd), 0);
  const listExpenseTotal = listExpense.reduce((s, r) => (r.state === 'voided' ? s : s + r.amount_twd), 0);

  const monthLabel = month === 'all' ? '不限月份' : month;

  return (
    <div className="space-y-4">
      <div>
        <NetBand netFace={netFace} netSettled={netSettled} incomeUnsettled={incomeUnsettled} expenseUnsettled={expenseUnsettled} />
        <div className="text-right text-[11.5px] mt-1.5" style={{ color: 'var(--nm-text-faint)' }}>
          全帳戶即時狀態　·　不受下方月份影響
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-4">
        <div className="min-w-0">
          <CashForecastTimeline forecast={forecast} startBalance={cashStartBalance} safetyLevel={cashSafetyLevel} />
        </div>
        <div className="min-w-0">
          <AiInsightCard insight={insight} />
        </div>
      </div>

      {/* v2:月份與篩選從頁面頂部搬到這裡——只作用於下面的已收付明細列表,
          監測帶(上方)永遠是未篩選的全帳戶狀態。見 docs/ledger-home-v2-spec.md §3。 */}
      <div className="pt-2" style={{ borderTop: '1px solid var(--nm-border-hair)' }}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <div className="text-[15px] font-semibold" style={{ color: 'var(--nm-text-primary)' }}>本月已收付明細</div>
            <div className="text-[12px] mt-0.5" style={{ color: 'var(--nm-text-muted)' }}>{monthLabel}　·　只含已收付分錄,未結約定請看應收款／應付款</div>
          </div>
          <div className="flex items-center gap-2 text-[13px]">
            <Link href={buildHref(base, { month: shiftMonth(month === 'all' ? currentMonth() : month, -1) })} className="nm-btn" style={{ padding: '4px 10px', minHeight: 'auto' }}>← 上月</Link>
            <span className="font-semibold min-w-[6rem] text-center" style={{ color: 'var(--nm-text-primary)' }}>{monthLabel}</span>
            <Link href={buildHref(base, { month: shiftMonth(month === 'all' ? currentMonth() : month, 1) })} className="nm-btn" style={{ padding: '4px 10px', minHeight: 'auto' }}>下月 →</Link>
            {month !== currentMonth() && (
              <Link href={buildHref(base, { month: currentMonth() })} className="underline" style={{ color: 'var(--nm-text-muted)', padding: '4px 8px' }}>回本月</Link>
            )}
          </div>
        </div>

        <div className="mb-3">
          <LedgerFilterBar mode="all" month={month} siteId={siteId} kind={kind} invoice={invoice} ext={ext} sites={sites} base={base} showKindInvoiceExt />
        </div>

        <div className="hidden lg:grid grid-cols-2 gap-4">
          <SettledMonthList title="收入" tone="income" items={listIncome} columnTotal={listIncomeTotal} />
          <SettledMonthList title="支出" tone="expense" items={listExpense} columnTotal={listExpenseTotal} />
        </div>
        <IncomeExpenseTabs
          income={<SettledMonthList title="收入" tone="income" items={listIncome} columnTotal={listIncomeTotal} />}
          expense={<SettledMonthList title="支出" tone="expense" items={listExpense} columnTotal={listExpenseTotal} />}
        />
      </div>
    </div>
  );
}
