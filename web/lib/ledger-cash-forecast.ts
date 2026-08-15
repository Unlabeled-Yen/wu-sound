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
  label?: string;
  overdue?: boolean;
}

export interface WeekItem {
  label: string;
  amount: number;
  direction: 'receivable' | 'payable';
  overdue: boolean;
}

export interface WeekBucket {
  weekIndex: 0 | 1 | 2 | 3;
  from: string;
  to: string;
  incomeTwd: number;
  expenseTwd: number;
  items: WeekItem[];
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
  /** 每週結束時的累計餘額(起點 + 各週淨流入,如期收款情境)。 */
  balanceTrajectory: number[];
  /**
   * 「最大一筆未結應收再延一個月」情境的餘額軌跡——對照 prototypes/7a.html 的
   * 「南方劇場再延一個月」線。挑最大金額那筆不是預測它真的會延,是讓老闆一眼看到
   * 「如果這筆最有份量的應收又拖了,對現金水位衝擊多大」,幫助判斷該不該催。
   * 沒有任何開放應收時為 null,UI 必須能處理只有單一軌跡的情況,不能假裝有兩條。
   */
  delayedTrajectory: number[] | null;
  /** 被挑中模擬延遲的那筆應收的顯示名稱,legend 與 tooltip 用。 */
  delayedReceivableLabel: string | null;
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

interface Bucketed {
  weeks: WeekBucket[];
  overdueIncomeTwd: number;
  overdueExpenseTwd: number;
  beyondIncomeTwd: number;
  beyondExpenseTwd: number;
  beyondIncomeCount: number;
  beyondExpenseCount: number;
  unscheduledIncomeTwd: number;
  unscheduledExpenseTwd: number;
  unscheduledIncomeCount: number;
  unscheduledExpenseCount: number;
  balanceTrajectory: number[];
}

function bucket(rows: ForecastReceivable[], today: string, startBalance: number): Bucketed {
  const weeks: WeekBucket[] = [0, 1, 2, 3].map((i) => ({
    weekIndex: i as 0 | 1 | 2 | 3,
    from: addDays(today, i * 7),
    to: addDays(today, i * 7 + 6),
    incomeTwd: 0,
    expenseTwd: 0,
    items: [],
  }));

  let overdueIncomeTwd = 0;
  let overdueExpenseTwd = 0;
  let beyondIncomeTwd = 0, beyondExpenseTwd = 0, beyondIncomeCount = 0, beyondExpenseCount = 0;
  let unscheduledIncomeTwd = 0, unscheduledExpenseTwd = 0, unscheduledIncomeCount = 0, unscheduledExpenseCount = 0;

  const isIncome = (dir: 'receivable' | 'payable') => dir === 'receivable';

  for (const r of rows) {
    if (r.remaining_twd <= 0) continue;
    const income = isIncome(r.direction);
    const itemLabel = r.label ?? (income ? '應收' : '應付');

    if (!r.agreed_due_date) {
      if (income) { unscheduledIncomeTwd += r.remaining_twd; unscheduledIncomeCount++; }
      else { unscheduledExpenseTwd += r.remaining_twd; unscheduledExpenseCount++; }
      continue;
    }

    const offset = diffDays(today, r.agreed_due_date);
    if (offset < 0) {
      if (income) { weeks[0].incomeTwd += r.remaining_twd; overdueIncomeTwd += r.remaining_twd; }
      else { weeks[0].expenseTwd += r.remaining_twd; overdueExpenseTwd += r.remaining_twd; }
      weeks[0].items.push({ label: itemLabel, amount: r.remaining_twd, direction: r.direction, overdue: true });
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
    weeks[weekIndex].items.push({ label: itemLabel, amount: r.remaining_twd, direction: r.direction, overdue: false });
  }

  const balanceTrajectory: number[] = [];
  let running = startBalance;
  for (const w of weeks) {
    running += w.incomeTwd - w.expenseTwd;
    balanceTrajectory.push(running);
  }

  return {
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
    balanceTrajectory,
  };
}

/** 挑「延遲情境」要模擬的那一筆——目前開放應收裡金額最大的一筆。 */
function pickDelayRisk(rows: ForecastReceivable[]): ForecastReceivable | null {
  const candidates = rows.filter((r) => r.direction === 'receivable' && r.remaining_twd > 0);
  if (candidates.length === 0) return null;
  return candidates.reduce((max, r) => (r.remaining_twd > max.remaining_twd ? r : max));
}

export function buildCashForecast(rows: ForecastReceivable[], today: string, startBalance = 0, delayDays = 30): CashForecast {
  const base = bucket(rows, today, startBalance);

  const risk = pickDelayRisk(rows);
  let delayedTrajectory: number[] | null = null;
  let delayedReceivableLabel: string | null = null;
  if (risk) {
    const shiftedRows = rows.map((r) =>
      r === risk ? { ...r, agreed_due_date: addDays(r.agreed_due_date ?? today, delayDays) } : r,
    );
    delayedTrajectory = bucket(shiftedRows, today, startBalance).balanceTrajectory;
    delayedReceivableLabel = risk.label ?? '最大應收';
  }

  return {
    today,
    ...base,
    delayedTrajectory,
    delayedReceivableLabel,
  };
}
