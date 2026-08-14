import { LEDGER_KIND_LABEL, type LedgerEntry, type LedgerKind, type InvoiceStatus } from '@/lib/types';
import { summarizeEntries } from '@/lib/ledger-summary';
import { fetchReceivablesWithRemaining, type ReceivableWithRemaining } from '@/lib/receivables-query';
import { buildCashForecast, type ForecastReceivable } from '@/lib/ledger-cash-forecast';
import { generateLedgerInsight } from '@/lib/ledger-insight';
import { taipeiTodayStr } from '@/lib/tz';
import { getSupabaseAdmin } from '@/lib/supabase';
import { buildHref, monthRange, NO_SITE, type SP } from './ledger-page-helpers';
import { NetBand } from './NetBand';
import { ColumnHeader, rankTop3 } from './ColumnHeader';
import { CashForecastTimeline } from './CashForecastTimeline';
import { AiInsightCard } from './AiInsightCard';
import { MixedList, type AllListItem } from './MixedList';
import { IncomeExpenseTabs } from './IncomeExpenseTabs';

// 帳務首頁(mode=all):帳面視角(已收付分錄 + 未結的應收應付約定 全部計入),但已收/未收
// 永遠分開標,絕不合成單一模糊數字——收支各自的比例條、常駐雙淨額都是為了守住這條線。
export async function AllView({
  sb, month, siteId, kind, invoice, toCheckOnly, ext, base, toCheckCount, toIssueCount,
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
}) {
  let q = sb.from('ledger_entries').select('*, sites(name)').eq('state', 'posted');
  if (month !== 'all') {
    const { from, to } = monthRange(month);
    q = q.gte('occurred_on', from).lte('occurred_on', to);
  }
  if (siteId === NO_SITE) q = q.is('site_id', null);
  else if (siteId) q = q.eq('site_id', siteId);
  if (kind) q = q.eq('kind', kind);
  if (invoice) q = q.eq('invoice_status', invoice);
  if (toCheckOnly) q = q.eq('to_check', true);
  if (ext === 'internal') q = q.eq('is_external', false);
  else if (ext === 'external') q = q.eq('is_external', true);
  q = q.order('occurred_on', { ascending: false }).order('created_at', { ascending: false });

  const [entriesRes, receivablesRes] = await Promise.all([
    q,
    // 應收應付永遠不受月份篩選——這是「現在還欠多少」的餘額,不是某段期間發生的流水。
    fetchReceivablesWithRemaining(sb, { status: 'open' }),
  ]);

  if (entriesRes.error || receivablesRes.error) {
    return (
      <div className="rounded-2xl px-4 py-3 text-[13px]" style={{ background: 'rgba(224,122,122,0.08)', border: '1px solid rgba(224,122,122,0.34)', color: 'var(--nm-danger-glass-text)' }}>
        讀取失敗,以下數字不可信:{entriesRes.error?.message ?? receivablesRes.error}
      </div>
    );
  }

  type Row = LedgerEntry & { sites?: { name: string } | null };
  const entries = (entriesRes.data ?? []) as Row[];
  let receivables = receivablesRes.rows;
  if (siteId === NO_SITE) receivables = receivables.filter((r) => !r.site_id);
  else if (siteId) receivables = receivables.filter((r) => r.site_id === siteId);

  const incomeEntries = entries.filter((r) => r.direction === 'income');
  const expenseEntries = entries.filter((r) => r.direction === 'expense');
  const openReceivables = receivables.filter((r) => r.direction === 'receivable');
  const openPayables = receivables.filter((r) => r.direction === 'payable');

  const { feeTotal } = summarizeEntries(entries);
  const incomeSettled = incomeEntries.reduce((s, r) => s + r.amount_twd, 0);
  const expenseSettled = expenseEntries.reduce((s, r) => s + r.amount_twd, 0);
  const incomeUnsettled = openReceivables.reduce((s, r) => s + Math.max(0, r.remaining_twd), 0);
  const expenseUnsettled = openPayables.reduce((s, r) => s + Math.max(0, r.remaining_twd), 0);
  const incomeFace = incomeSettled + incomeUnsettled;
  const expenseFace = expenseSettled + expenseUnsettled;
  const netFace = incomeFace - expenseFace;
  const netSettled = incomeSettled - expenseSettled - feeTotal;

  // 收入排行按專案(你的收入幾乎都是案件收款,按分類切沒資訊量;按專案切才回答
  // 「這個月的錢是哪幾個案子貢獻的」)。已收+未收合併計入,才是這個專案的完整貢獻。
  const incomeBySite = new Map<string, { label: string; amount: number }>();
  const addSite = (id: string | null, name: string | undefined, amt: number) => {
    const key = id ?? NO_SITE;
    const cur = incomeBySite.get(key) ?? { label: id ? (name ?? '?') : '專案外', amount: 0 };
    cur.amount += amt;
    incomeBySite.set(key, cur);
  };
  incomeEntries.forEach((r) => addSite(r.site_id, r.sites?.name, r.amount_twd));
  openReceivables.forEach((r) => addSite(r.site_id, r.sites?.name, Math.max(0, r.remaining_twd)));
  const incomeRanking = rankTop3(incomeBySite);

  // 支出排行按分類(薪資/貨款/租金…才是「錢花去哪了」的答案)。只算已付分錄——
  // 應付約定沒有 kind 欄位,無法併入同一組排行,未付金額仍完整反映在比例條的「未付」數字。
  const expenseByKind = new Map<string, { label: string; amount: number }>();
  expenseEntries.forEach((r) => {
    const cur = expenseByKind.get(r.kind) ?? { label: LEDGER_KIND_LABEL[r.kind], amount: 0 };
    cur.amount += r.amount_twd;
    expenseByKind.set(r.kind, cur);
  });
  const expenseRanking = rankTop3(expenseByKind);

  // 未來四週現金:全是預估,依約定日分桶,資料層與已收付彙總分開算(見 lib/ledger-cash-forecast)。
  const forecastRows: ForecastReceivable[] = [...openReceivables, ...openPayables].map((r) => ({
    direction: r.direction,
    remaining_twd: r.remaining_twd,
    agreed_due_date: r.agreed_due_date,
  }));
  const forecast = buildCashForecast(forecastRows, taipeiTodayStr());

  const overdueReceivables = openReceivables.filter((r) => r.agreed_due_date && r.agreed_due_date < taipeiTodayStr() && r.remaining_twd > 0);
  const insight = generateLedgerInsight({
    month,
    entryCount: entries.length,
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

  // 列表:未結的約定排最上面(那是要行動的),已結的分錄接著照日期排。
  const incomeUnsettledItems = openReceivables.map((row): Extract<AllListItem, { type: 'receivable' }> => ({ type: 'receivable', row }));
  const incomeSettledItems = incomeEntries.map((row): Extract<AllListItem, { type: 'entry' }> => ({ type: 'entry', row }));
  const expenseUnsettledItems = openPayables.map((row): Extract<AllListItem, { type: 'receivable' }> => ({ type: 'receivable', row }));
  const expenseSettledItems = expenseEntries.map((row): Extract<AllListItem, { type: 'entry' }> => ({ type: 'entry', row }));

  return (
    <div className="space-y-4">
      <NetBand netFace={netFace} netSettled={netSettled} incomeUnsettled={incomeUnsettled} expenseUnsettled={expenseUnsettled} />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4">
        <CashForecastTimeline forecast={forecast} />
        <AiInsightCard insight={insight} />
      </div>

      {/* 收支欄首統計:兩欄固定同高,不隨排行筆數多寡變動——切篩選時版面不跳動。
          桌機並排;手機只看當前切換到的那一邊(跟下面的混排列表同一顆 tab 狀態,
          見原型 2b——手機版欄首卡只顯示所選方向那一張,不是兩張都塞進來)。 */}
      <div className="hidden lg:grid grid-cols-2 gap-4">
        <ColumnHeader
          label="收入" faceAmount={incomeFace} settledAmount={incomeSettled} unsettledAmount={incomeUnsettled}
          settledLabel="已收" unsettledLabel="未收" tone="income"
          settledHref={buildHref(base, { mode: 'settled' })} unsettledHref={buildHref(base, { mode: 'receivable' })}
          ranking={incomeRanking} rankingHrefFor={(key) => buildHref(base, { site_id: key })}
        />
        <ColumnHeader
          label="支出" faceAmount={expenseFace} settledAmount={expenseSettled} unsettledAmount={expenseUnsettled}
          settledLabel="已付" unsettledLabel="未付" tone="expense"
          settledHref={buildHref(base, { mode: 'settled' })} unsettledHref={buildHref(base, { mode: 'payable' })}
          ranking={expenseRanking} rankingHrefFor={(key) => buildHref(base, { kind: key })}
        />
      </div>

      {/* 混排列表:跟頁面捲動,分段標頭吸頂——取消原本固定 560px 內部捲動的面板。
          桌機並排;手機改切換,一次只看一邊,欄首卡跟著同一顆 tab 走。 */}
      <div className="hidden lg:grid grid-cols-2 gap-4">
        <MixedList title="收入" tone="income" unsettledItems={incomeUnsettledItems} settledItems={incomeSettledItems} />
        <MixedList title="支出" tone="expense" unsettledItems={expenseUnsettledItems} settledItems={expenseSettledItems} />
      </div>
      <IncomeExpenseTabs
        income={
          <div className="flex flex-col gap-4">
            <ColumnHeader
              label="收入" faceAmount={incomeFace} settledAmount={incomeSettled} unsettledAmount={incomeUnsettled}
              settledLabel="已收" unsettledLabel="未收" tone="income"
              settledHref={buildHref(base, { mode: 'settled' })} unsettledHref={buildHref(base, { mode: 'receivable' })}
              ranking={incomeRanking} rankingHrefFor={(key) => buildHref(base, { site_id: key })}
            />
            <MixedList title="收入" tone="income" unsettledItems={incomeUnsettledItems} settledItems={incomeSettledItems} />
          </div>
        }
        expense={
          <div className="flex flex-col gap-4">
            <ColumnHeader
              label="支出" faceAmount={expenseFace} settledAmount={expenseSettled} unsettledAmount={expenseUnsettled}
              settledLabel="已付" unsettledLabel="未付" tone="expense"
              settledHref={buildHref(base, { mode: 'settled' })} unsettledHref={buildHref(base, { mode: 'payable' })}
              ranking={expenseRanking} rankingHrefFor={(key) => buildHref(base, { kind: key })}
            />
            <MixedList title="支出" tone="expense" unsettledItems={expenseUnsettledItems} settledItems={expenseSettledItems} />
          </div>
        }
      />
    </div>
  );
}
