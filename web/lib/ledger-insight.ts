/**
 * 帳務首頁「收支分析」卡的文案產生器。目前是規則式模板(依實際數字組句),
 * 不是接生成式模型——依 handoff 建議的實作順序,先把版位和資訊架構做對,
 * 之後要換成真的模型呼叫時,只需要替換這個函式的實作,UI 不用動。
 *
 * 不捏造任何數字或原因:每一句話都能對應到呼叫端算好的欄位,算不出來的
 * 就不講(例如沒有現金餘額功能就不會出現「現金水位」相關句子)。
 */

export interface LedgerInsightInput {
  month: string;
  entryCount: number;
  unsettledCount: number;
  incomeFace: number;
  expenseFace: number;
  netFace: number;
  netSettled: number;
  overdueIncomeTwd: number;
  overdueIncomeCount: number;
  toCheckCount: number;
  toIssueCount: number;
  topIncomeLabel: string | null;
  topIncomeAmount: number;
}

export interface LedgerInsightAction {
  label: string;
  href: string;
}

export interface LedgerInsight {
  headline: string;
  secondary: string[];
  action: LedgerInsightAction | null;
  basisNote: string;
}

export function generateLedgerInsight(input: LedgerInsightInput): LedgerInsight {
  const gap = input.netFace - input.netSettled;
  const secondary: string[] = [];

  const headlineParts: string[] = [];
  if (input.netFace >= 0) headlineParts.push(`帳面淨額 $${fmt(input.netFace)} 為正`);
  else headlineParts.push(`帳面淨額 $${fmt(input.netFace)} 為負,要注意`);
  if (Math.abs(gap) > 0) {
    headlineParts.push(`實收實付淨額只有 $${fmt(input.netSettled)},差距 $${fmt(Math.abs(gap))} 還沒真正入帳`);
  }
  const headline = headlineParts.join('，') + '。';

  if (input.topIncomeLabel) {
    secondary.push(`收入主要來自「${input.topIncomeLabel}」,貢獻 $${fmt(input.topIncomeAmount)}。`);
  }
  if (input.overdueIncomeCount > 0) {
    secondary.push(`有 ${input.overdueIncomeCount} 筆應收已逾期,合計 $${fmt(input.overdueIncomeTwd)}——催收風險最高的部分。`);
  }
  if (input.toCheckCount > 0) {
    secondary.push(`${input.toCheckCount} 筆帳目 AI 拆帳沒把握,標記「待確認」等人工覆核。`);
  }

  let action: LedgerInsightAction | null = null;
  if (input.overdueIncomeCount > 0) {
    action = { label: `處理 ${input.overdueIncomeCount} 筆已逾期應收`, href: '/boss/ledger?mode=receivable' };
  } else if (input.toIssueCount > 0) {
    action = { label: `開立 ${input.toIssueCount} 筆待開發票`, href: '/boss/ledger?mode=settled&month=all&invoice=to_issue' };
  } else if (input.toCheckCount > 0) {
    action = { label: `覆核 ${input.toCheckCount} 筆 AI 待確認帳目`, href: '/boss/ledger?mode=settled&month=all&to_check=1' };
  }

  const basisNote = `規則式摘要(非生成式模型),已收與未收分別計算、未合併。依據 ${input.month === 'all' ? '不限月份' : input.month} · ${input.entryCount} 筆分錄與 ${input.unsettledCount} 筆未結約定。`;

  return { headline, secondary, action, basisNote };
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString('zh-TW');
}

/**
 * 「待補」分頁的三張卡(design_handoff_wu_sound 10/14-cashflow-insight.md)。
 * 殘差公式跟 NetBand.tsx 一致(同一份帳,不能算出兩個不同的殘差數字)。
 * 「缺客戶名」「帳齡分佈」直接用呼叫端已經查好的 monitorEntries/receivables
 * 算,不另外查表。
 */
export interface LedgerInsightTodoResidual {
  amountTwd: number;
  incomeUnsettled: number;
  expenseUnsettled: number;
}

export interface LedgerInsightTodoMissingCustomer {
  amountTwd: number;
}

export interface LedgerInsightTodoAging {
  notDue: number;
  within30: number;
  overdue: number;
}

export interface LedgerInsightTodo {
  residual: LedgerInsightTodoResidual | null;
  missingCustomer: LedgerInsightTodoMissingCustomer | null;
  aging: LedgerInsightTodoAging | null;
}

export function buildLedgerInsightTodo(input: {
  netFace: number;
  netSettled: number;
  incomeUnsettled: number;
  expenseUnsettled: number;
  missingCustomerAmount: number | null;
  agingRows: Array<{ agreedDueDate: string | null }>;
  todayStr: string;
}): LedgerInsightTodo {
  const gap = input.netFace - input.netSettled;
  const receivablePayableDiff = input.incomeUnsettled - input.expenseUnsettled;
  const residualValue = gap - receivablePayableDiff;

  const residual = Math.abs(residualValue) >= 1
    ? { amountTwd: Math.abs(residualValue), incomeUnsettled: input.incomeUnsettled, expenseUnsettled: input.expenseUnsettled }
    : null;

  const missingCustomer = input.missingCustomerAmount && input.missingCustomerAmount > 0
    ? { amountTwd: input.missingCustomerAmount }
    : null;

  const in30 = addDaysStr(input.todayStr, 30);
  let notDue = 0, within30 = 0, overdue = 0;
  for (const r of input.agingRows) {
    if (!r.agreedDueDate) { notDue++; continue; }
    if (r.agreedDueDate < input.todayStr) overdue++;
    else if (r.agreedDueDate < in30) within30++;
    else notDue++;
  }
  const aging = notDue + within30 + overdue > 0 ? { notDue, within30, overdue } : null;

  return { residual, missingCustomer, aging };
}

function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00Z').getTime();
  const db = new Date(b + 'T00:00:00Z').getTime();
  return Math.round((db - da) / 86400000);
}

/**
 * 「變化」分頁(design_handoff_wu_sound 10/14-cashflow-insight.md commit 3)。
 * 六個月實收淨額直接從 monitorEntries(全帳戶已過帳分錄)按月加總,跟首頁
 * 其他數字同一份資料、同一個 net 公式(income − expense − fee),不另開一套算法。
 *
 * 「應收款也同步放大」這句原型有,但本頁沒有應收款的歷史快照(receivable_payment_state
 * 只反映當下),沒資料就不講,不編造趨勢——見檔頭「不捏造任何數字或原因」。
 *
 * 平均收款天數 = 每筆已收的應收約定,從 receivables.created_at 到最後一筆
 * 已過帳收款分錄(receivable_id 連回去的那筆)之間的天數,按收款分錄所在月份分桶。
 */
export interface LedgerInsightChangeMonth {
  month: string;
  net: number;
}

export interface LedgerInsightChangeMoM {
  latestIsHighest: boolean;
  diffTwd: number;
  pct: number | null;
}

export interface LedgerInsightChangeCollectionDays {
  currentAvgDays: number;
  diffDays: number | null;
}

export interface LedgerInsightChange {
  months: LedgerInsightChangeMonth[];
  mom: LedgerInsightChangeMoM | null;
  collectionDays: LedgerInsightChangeCollectionDays | null;
}

export function buildLedgerInsightChange(input: {
  entries: Array<{ occurred_on: string; direction: 'income' | 'expense'; amount_twd: number; fee_twd: number }>;
  collections: Array<{ receivableCreatedAt: string; settledOn: string }>;
  monthsBack: number;
  todayStr: string;
}): LedgerInsightChange {
  const monthKeys: string[] = [];
  const [ty, tm] = input.todayStr.slice(0, 7).split('-').map(Number);
  for (let i = input.monthsBack - 1; i >= 0; i--) {
    const idx = ty * 12 + (tm - 1) - i;
    const y = Math.floor(idx / 12);
    const m = (idx % 12) + 1;
    monthKeys.push(`${y}-${String(m).padStart(2, '0')}`);
  }

  const netByMonth = new Map(monthKeys.map((k) => [k, 0]));
  for (const e of input.entries) {
    const k = monthKey(e.occurred_on);
    if (!netByMonth.has(k)) continue;
    const delta = (e.direction === 'income' ? e.amount_twd : -e.amount_twd) - e.fee_twd;
    netByMonth.set(k, (netByMonth.get(k) ?? 0) + delta);
  }
  const months = monthKeys.map((k) => ({ month: k, net: netByMonth.get(k) ?? 0 }));

  let mom: LedgerInsightChangeMoM | null = null;
  if (months.length >= 2) {
    const latest = months[months.length - 1].net;
    const prev = months[months.length - 2].net;
    const maxNet = Math.max(...months.map((m) => m.net));
    mom = {
      latestIsHighest: latest === maxNet,
      diffTwd: latest - prev,
      pct: prev !== 0 ? ((latest - prev) / Math.abs(prev)) * 100 : null,
    };
  }

  const daysByMonth = new Map<string, number[]>();
  for (const c of input.collections) {
    const k = monthKey(c.settledOn);
    const days = daysBetween(c.receivableCreatedAt.slice(0, 10), c.settledOn);
    if (days < 0) continue; // 資料異常(收款早於建立約定),不計入平均以免拉出假天數
    if (!daysByMonth.has(k)) daysByMonth.set(k, []);
    daysByMonth.get(k)!.push(days);
  }
  const avg = (arr: number[]) => arr.reduce((s, n) => s + n, 0) / arr.length;
  const currentMonthKey = monthKeys[monthKeys.length - 1];
  const prevMonthKey = monthKeys[monthKeys.length - 2];
  const currentDays = daysByMonth.get(currentMonthKey);
  const prevDays = prevMonthKey ? daysByMonth.get(prevMonthKey) : undefined;
  const collectionDays: LedgerInsightChangeCollectionDays | null = currentDays && currentDays.length > 0
    ? { currentAvgDays: Math.round(avg(currentDays)), diffDays: prevDays && prevDays.length > 0 ? Math.round(avg(currentDays) - avg(prevDays)) : null }
    : null;

  return { months, mom, collectionDays };
}

/**
 * 「關聯」分頁(commit 4)。只做原型裡驗證得了的那一件:同一個 site_id
 * 底下,應付到期日比應收約定收款日早的案子——用 openReceivables/openPayables
 * 已經查好的資料算(都有 agreed_due_date、site_id、remaining_twd),不另開查詢。
 *
 * 原型裡「哪兩筆收款撐住第 2/4 週」「有付款尚未開出對應報價」需要接回現金
 * 河道的每週明細跟報價單資料比對,這輪還沒有這兩份資料的可靠連結方式,
 * 所以不做——只呈現算得出來、對得起來的那一件。
 */
export interface LedgerInsightLinkCase {
  siteId: string;
  siteLabel: string;
  gapDays: number;
  payableDueDate: string;
  payableAmount: number;
  receivableDueDate: string;
  receivableAmount: number;
}

export function buildLedgerInsightLink(input: {
  openPayables: Array<{ site_id: string | null; siteLabel: string; agreed_due_date: string | null; remaining_twd: number }>;
  openReceivables: Array<{ site_id: string | null; siteLabel: string; agreed_due_date: string | null; remaining_twd: number }>;
}): LedgerInsightLinkCase | null {
  const bySite = new Map<string, { label: string; payables: typeof input.openPayables; receivables: typeof input.openReceivables }>();
  for (const p of input.openPayables) {
    if (!p.site_id || !p.agreed_due_date) continue;
    if (!bySite.has(p.site_id)) bySite.set(p.site_id, { label: p.siteLabel, payables: [], receivables: [] });
    bySite.get(p.site_id)!.payables.push(p);
  }
  for (const r of input.openReceivables) {
    if (!r.site_id || !r.agreed_due_date) continue;
    if (!bySite.has(r.site_id)) bySite.set(r.site_id, { label: r.siteLabel, payables: [], receivables: [] });
    bySite.get(r.site_id)!.receivables.push(r);
  }

  let worst: LedgerInsightLinkCase | null = null;
  for (const [siteId, group] of bySite) {
    if (group.payables.length === 0 || group.receivables.length === 0) continue;
    const earliestPayable = group.payables.reduce((a, b) => (a.agreed_due_date! < b.agreed_due_date! ? a : b));
    const earliestReceivable = group.receivables.reduce((a, b) => (a.agreed_due_date! < b.agreed_due_date! ? a : b));
    const gapDays = daysBetween(earliestPayable.agreed_due_date!, earliestReceivable.agreed_due_date!);
    if (gapDays <= 0) continue; // 先收後付或同一天,不算「錢先出後進」
    if (!worst || gapDays > worst.gapDays) {
      worst = {
        siteId,
        siteLabel: group.label,
        gapDays,
        payableDueDate: earliestPayable.agreed_due_date!,
        payableAmount: earliestPayable.remaining_twd,
        receivableDueDate: earliestReceivable.agreed_due_date!,
        receivableAmount: earliestReceivable.remaining_twd,
      };
    }
  }
  return worst;
}
