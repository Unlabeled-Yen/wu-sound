import type { LedgerDirection } from './types';

export interface LedgerSummaryRow {
  direction: LedgerDirection;
  amount_twd: number;
  fee_twd?: number | null;
  is_external?: boolean | null;
  tax_amount_twd?: number | null;
}

export interface LedgerSummary {
  income: number;
  expense: number;
  feeTotal: number;
  net: number;
  extIncome: number;
  extTax: number;
}

/**
 * 收支合計的唯一實作。/boss 總覽、帳簿看板、帳目明細頁三處共用——
 * 一致性由「共用同一個函式」在建構上保證,不是靠事後人工對照三頁數字。
 *
 * 呼叫端負責只餵入該計入合計的列(通常是 state<>'voided' 或 status='active');
 * 本函式不做任何篩選,餵什麼就算什麼。
 */
export function summarizeEntries(rows: LedgerSummaryRow[]): LedgerSummary {
  let income = 0;
  let expense = 0;
  let feeTotal = 0;
  let extIncome = 0;
  let extTax = 0;

  for (const r of rows) {
    if (r.direction === 'income') income += r.amount_twd;
    else expense += r.amount_twd;
    feeTotal += r.fee_twd ?? 0;
    if (r.is_external) {
      if (r.direction === 'income') extIncome += r.amount_twd;
      extTax += r.tax_amount_twd ?? 0;
    }
  }

  // 淨額扣手續費:轉帳費是真的從戶頭出去的錢,不扣的話淨額會虛高(批 0 的修正)。
  const net = income - expense - feeTotal;

  return { income, expense, feeTotal, net, extIncome, extTax };
}
