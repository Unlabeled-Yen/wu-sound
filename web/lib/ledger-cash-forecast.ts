/**
 * 帳務首頁「未來四週現金」的分桶邏輯。刻意跟 summarizeEntries 分開實作——
 * 這裡算的全是預估(依未收/未付約定的約定日推算),不是已收付彙總,兩者混在一起
 * 會讓「現金時間軸」看起來像已經發生的事實。
 *
 * NULL 的 agreed_due_date 不可預設塞進任何一週——那是換一種方式假裝有資料。
 * 一律獨立算進 unscheduled,呼叫端必須把這組數字顯示出來,不能吞掉。
 */

export interface ForecastReceivable {
  direction: 'receivable' | 'payable';
  remaining_twd: number;
  agreed_due_date: string | null; // 'YYYY-MM-DD'
}

export interface WeekBucket {
  weekIndex: 0 | 1 | 2 | 3;
  from: string;
  to: string;
  incomeTwd: number;
  expenseTwd: number;
}

export interface CashForecast {
  today: string;
  weeks: WeekBucket[]; // 4 週,index 0 = 本週起算
  /** 已逾期(due date < today)仍未結——併入第 0 週的收付金額,但單獨列出讓 UI 可以標紅。 */
  overdueIncomeTwd: number;
  overdueExpenseTwd: number;
  /** 到期日在 4 週範圍之外,不畫進圖但要讓 UI 顯示筆數/金額,不可靜默消失。 */
  beyondIncomeTwd: number;
  beyondExpenseTwd: number;
  beyondIncomeCount: number;
  beyondExpenseCount: number;
  /** 沒有約定日期——結構上獨立於 4 週圖,UI 必須明講「未排定」。 */
  unscheduledIncomeTwd: number;
  unscheduledExpenseTwd: number;
  unscheduledIncomeCount: number;
  unscheduledExpenseCount: number;
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function diffDays(fromStr: string, toStr: string): number {
  const [y1, m1, d1] = fromStr.split('-').map(Number);
  const [y2, m2, d2] = toStr.split('-').map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / 86400000);
}

export function buildCashForecast(rows: ForecastReceivable[], today: string): CashForecast {
  const weeks: WeekBucket[] = [0, 1, 2, 3].map((i) => ({
    weekIndex: i as 0 | 1 | 2 | 3,
    from: addDays(today, i * 7),
    to: addDays(today, i * 7 + 6),
    incomeTwd: 0,
    expenseTwd: 0,
  }));

  let overdueIncomeTwd = 0;
  let overdueExpenseTwd = 0;
  let beyondIncomeTwd = 0, beyondExpenseTwd = 0, beyondIncomeCount = 0, beyondExpenseCount = 0;
  let unscheduledIncomeTwd = 0, unscheduledExpenseTwd = 0, unscheduledIncomeCount = 0, unscheduledExpenseCount = 0;

  const isIncome = (dir: 'receivable' | 'payable') => dir === 'receivable';

  for (const r of rows) {
    if (r.remaining_twd <= 0) continue; // 超收/超付不計入現金時間軸(那是另一個警訊,見淨額帶)
    const income = isIncome(r.direction);

    if (!r.agreed_due_date) {
      if (income) { unscheduledIncomeTwd += r.remaining_twd; unscheduledIncomeCount++; }
      else { unscheduledExpenseTwd += r.remaining_twd; unscheduledExpenseCount++; }
      continue;
    }

    const offset = diffDays(today, r.agreed_due_date);
    if (offset < 0) {
      // 已逾期:併入第 0 週的收付金額(仍是「近期會發生的錢」),另外累計逾期額供標紅。
      if (income) { weeks[0].incomeTwd += r.remaining_twd; overdueIncomeTwd += r.remaining_twd; }
      else { weeks[0].expenseTwd += r.remaining_twd; overdueExpenseTwd += r.remaining_twd; }
      continue;
    }
    if (offset > 27) {
      if (income) { beyondIncomeTwd += r.remaining_twd; beyondIncomeCount++; }
      else { beyondExpenseTwd += r.remaining_twd; beyondExpenseCount++; }
      continue;
    }

    const weekIndex = Math.floor(offset / 7) as 0 | 1 | 2 | 3;
    if (income) weeks[weekIndex].incomeTwd += r.remaining_twd;
    else weeks[weekIndex].expenseTwd += r.remaining_twd;
  }

  return {
    today,
    weeks,
    overdueIncomeTwd,
    overdueExpenseTwd,
    beyondIncomeTwd,
    beyondExpenseTwd,
    beyondIncomeCount,
    beyondExpenseCount,
    unscheduledIncomeTwd,
    unscheduledExpenseTwd,
    unscheduledIncomeCount,
    unscheduledExpenseCount,
  };
}
