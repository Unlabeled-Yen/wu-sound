import { describe, expect, it } from 'vitest';
import { buildCashForecast, type ForecastReceivable } from '../ledger-cash-forecast';

const TODAY = '2026-08-15';

describe('buildCashForecast', () => {
  it('依約定日分桶到正確的週(week0=今天起 7 天)', () => {
    const rows: ForecastReceivable[] = [
      { direction: 'receivable', remaining_twd: 100000, agreed_due_date: '2026-08-16' }, // +1 天 → week0
      { direction: 'receivable', remaining_twd: 50000, agreed_due_date: '2026-08-23' }, // +8 天 → week1
      { direction: 'payable', remaining_twd: 30000, agreed_due_date: '2026-09-05' }, // +21 天 → week3
    ];
    const f = buildCashForecast(rows, TODAY);
    expect(f.weeks[0].incomeTwd).toBe(100000);
    expect(f.weeks[1].incomeTwd).toBe(50000);
    expect(f.weeks[3].expenseTwd).toBe(30000);
  });

  it('沒有約定日期的獨立算進 unscheduled,不會被塞進任何一週', () => {
    const rows: ForecastReceivable[] = [
      { direction: 'receivable', remaining_twd: 20000, agreed_due_date: null },
      { direction: 'payable', remaining_twd: 8000, agreed_due_date: null },
    ];
    const f = buildCashForecast(rows, TODAY);
    expect(f.weeks.every((w) => w.incomeTwd === 0 && w.expenseTwd === 0)).toBe(true);
    expect(f.unscheduledIncomeTwd).toBe(20000);
    expect(f.unscheduledIncomeCount).toBe(1);
    expect(f.unscheduledExpenseTwd).toBe(8000);
    expect(f.unscheduledExpenseCount).toBe(1);
  });

  it('已逾期的併入 week0 並另外累計逾期額,供 UI 標紅', () => {
    const rows: ForecastReceivable[] = [
      { direction: 'receivable', remaining_twd: 15000, agreed_due_date: '2026-08-01' },
    ];
    const f = buildCashForecast(rows, TODAY);
    expect(f.weeks[0].incomeTwd).toBe(15000);
    expect(f.overdueIncomeTwd).toBe(15000);
  });

  it('超過 4 週的不畫進圖,但金額與筆數不能靜默消失', () => {
    const rows: ForecastReceivable[] = [
      { direction: 'payable', remaining_twd: 9000, agreed_due_date: '2026-10-01' },
    ];
    const f = buildCashForecast(rows, TODAY);
    expect(f.weeks.every((w) => w.expenseTwd === 0)).toBe(true);
    expect(f.beyondExpenseTwd).toBe(9000);
    expect(f.beyondExpenseCount).toBe(1);
  });

  it('超收超付(remaining_twd<=0)不計入現金時間軸', () => {
    const rows: ForecastReceivable[] = [
      { direction: 'receivable', remaining_twd: -500, agreed_due_date: '2026-08-16' },
      { direction: 'receivable', remaining_twd: 0, agreed_due_date: null },
    ];
    const f = buildCashForecast(rows, TODAY);
    expect(f.weeks[0].incomeTwd).toBe(0);
    expect(f.unscheduledIncomeTwd).toBe(0);
    expect(f.unscheduledIncomeCount).toBe(0);
  });

  it('空陣列回全零', () => {
    const f = buildCashForecast([], TODAY);
    expect(f.weeks.every((w) => w.incomeTwd === 0 && w.expenseTwd === 0)).toBe(true);
    expect(f.overdueIncomeTwd).toBe(0);
    expect(f.unscheduledIncomeTwd).toBe(0);
    expect(f.beyondIncomeTwd).toBe(0);
  });
});
