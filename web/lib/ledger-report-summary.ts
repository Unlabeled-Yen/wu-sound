import { summarizeEntries, type LedgerSummaryRow } from './ledger-summary';
import { LEDGER_KIND_LABEL, type LedgerKind } from './types';

// 報表中心的損益分類——R-RPT1(ledger-master-spec.md §3.6):營業收入/營業損益
// 排除借款(籌資活動)與投資/健檢(老闆個人/業外項),另立小計,不可混進營業損益。
const NON_OPERATING_KINDS: LedgerKind[] = ['loan', 'investment', 'health'];
// R-RPT4:credit_card 已退役,若期間內仍有舊資料,獨立列一行「已退役類別」,
// 不可靜默併入 other_expense——併入會讓使用者以為退役後舊分錄消失了。
const RETIRED_KINDS: LedgerKind[] = ['credit_card'];

export interface ReportEntryRow extends LedgerSummaryRow {
  kind: LedgerKind;
}

export interface KindAmount {
  kind: LedgerKind;
  label: string;
  amount: number;
}

export interface IncomeStatement {
  operatingIncomeRows: KindAmount[];
  operatingIncomeTotal: number;
  operatingExpenseRows: KindAmount[];
  operatingExpenseTotal: number;
  feeTotal: number;
  /** 營業損益 = 營業收入 − 營業支出 − 手續費,不含借款/投資/健檢/已退役類別 */
  operatingNet: number;
  /** 借款(收入方向) */
  nonOperatingIncomeRows: KindAmount[];
  /** 投資、健檢(支出方向,老闆個人/業外項) */
  nonOperatingExpenseRows: KindAmount[];
  /** 業外及個人項淨額(含已退役類別的歷史資料) */
  nonOperatingNet: number;
  /** credit_card 舊資料,已退役,獨立顯示不併入任何一般類別 */
  retiredRows: KindAmount[];
  /**
   * 本期淨額——直接來自 summarizeEntries()(R-RPT2,禁止重新 reduce)。
   * 恆等式:net === operatingNet + nonOperatingNet,兩者的殘差就是算法本身有洞。
   */
  net: number;
}

function groupByKind(
  rows: ReportEntryRow[],
  direction: 'income' | 'expense',
  filterKind: (kind: LedgerKind) => boolean,
): KindAmount[] {
  const m = new Map<LedgerKind, number>();
  for (const r of rows) {
    if (r.direction !== direction || !filterKind(r.kind)) continue;
    m.set(r.kind, (m.get(r.kind) ?? 0) + r.amount_twd);
  }
  return Array.from(m.entries())
    .map(([kind, amount]) => ({ kind, label: LEDGER_KIND_LABEL[kind] ?? kind, amount }))
    .sort((a, b) => b.amount - a.amount);
}

const sum = (rows: KindAmount[]) => rows.reduce((s, r) => s + r.amount, 0);

/**
 * 報表中心損益表的唯一實作。淨額委派給 summarizeEntries()(共用邏輯,R-RPT2),
 * 這裡只負責額外的「營業 vs 業外」分類——這個分類是報表獨有的口徑,
 * 其他分頁(金流監測/已收付)不需要,所以不下放進 summarizeEntries()。
 */
export function buildIncomeStatement(rows: ReportEntryRow[]): IncomeStatement {
  const summary = summarizeEntries(rows);

  const isOperating = (k: LedgerKind) => !NON_OPERATING_KINDS.includes(k) && !RETIRED_KINDS.includes(k);
  const isNonOperating = (k: LedgerKind) => NON_OPERATING_KINDS.includes(k);
  const isRetired = (k: LedgerKind) => RETIRED_KINDS.includes(k);

  const operatingIncomeRows = groupByKind(rows, 'income', isOperating);
  const operatingExpenseRows = groupByKind(rows, 'expense', isOperating);
  const nonOperatingIncomeRows = groupByKind(rows, 'income', isNonOperating); // loan
  const nonOperatingExpenseRows = groupByKind(rows, 'expense', isNonOperating); // investment, health
  const retiredRows = groupByKind(rows, 'expense', isRetired); // credit_card(舊資料)

  const operatingIncomeTotal = sum(operatingIncomeRows);
  const operatingExpenseTotal = sum(operatingExpenseRows);
  const operatingNet = operatingIncomeTotal - operatingExpenseTotal - summary.feeTotal;

  const nonOperatingNet = sum(nonOperatingIncomeRows) - sum(nonOperatingExpenseRows) - sum(retiredRows);

  return {
    operatingIncomeRows,
    operatingIncomeTotal,
    operatingExpenseRows,
    operatingExpenseTotal,
    feeTotal: summary.feeTotal,
    operatingNet,
    nonOperatingIncomeRows,
    nonOperatingExpenseRows,
    nonOperatingNet,
    retiredRows,
    net: summary.net,
  };
}
