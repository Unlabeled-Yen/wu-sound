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
