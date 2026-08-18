import { describe, expect, it } from 'vitest';
import { buildIncomeStatement, type ReportEntryRow } from '../ledger-report-summary';

describe('buildIncomeStatement', () => {
  it('借款不計入營業收入(R-RPT1)——只進業外項', () => {
    const rows: ReportEntryRow[] = [
      { direction: 'income', kind: 'project', amount_twd: 100000, fee_twd: 0 },
      { direction: 'income', kind: 'loan', amount_twd: 500000, fee_twd: 0 },
    ];
    const s = buildIncomeStatement(rows);
    expect(s.operatingIncomeTotal).toBe(100000);
    expect(s.nonOperatingIncomeRows).toEqual([{ kind: 'loan', label: '借款/資本', amount: 500000 }]);
  });

  it('投資/健檢不計入營業支出,列業外及個人項', () => {
    const rows: ReportEntryRow[] = [
      { direction: 'expense', kind: 'rent', amount_twd: 20000, fee_twd: 0 },
      { direction: 'expense', kind: 'investment', amount_twd: 300000, fee_twd: 0 },
      { direction: 'expense', kind: 'health', amount_twd: 5000, fee_twd: 0 },
    ];
    const s = buildIncomeStatement(rows);
    expect(s.operatingExpenseTotal).toBe(20000);
    expect(s.nonOperatingExpenseRows.map((r) => r.kind).sort()).toEqual(['health', 'investment']);
  });

  it('恆等式:net === operatingNet + nonOperatingNet,不准有殘差', () => {
    const rows: ReportEntryRow[] = [
      { direction: 'income', kind: 'project', amount_twd: 200000, fee_twd: 0 },
      { direction: 'income', kind: 'loan', amount_twd: 500000, fee_twd: 0 },
      { direction: 'expense', kind: 'goods', amount_twd: 50000, fee_twd: 15 },
      { direction: 'expense', kind: 'investment', amount_twd: 100000, fee_twd: 0 },
      { direction: 'expense', kind: 'credit_card', amount_twd: 8000, fee_twd: 0 },
    ];
    const s = buildIncomeStatement(rows);
    expect(s.net).toBe(s.operatingNet + s.nonOperatingNet);
  });

  it('營業損益必扣手續費(承接 R-AMT1,批 0 的修正不許在報表層回退)', () => {
    const rows: ReportEntryRow[] = [
      { direction: 'income', kind: 'project', amount_twd: 10000, fee_twd: 0 },
      { direction: 'expense', kind: 'rent', amount_twd: 3000, fee_twd: 15 },
    ];
    const s = buildIncomeStatement(rows);
    expect(s.operatingNet).toBe(6985);
    expect(s.net).toBe(6985);
  });

  it('credit_card(已退役)獨立列出,不併入 other_expense', () => {
    const rows: ReportEntryRow[] = [
      { direction: 'expense', kind: 'credit_card', amount_twd: 12000, fee_twd: 0 },
      { direction: 'expense', kind: 'other_expense', amount_twd: 3000, fee_twd: 0 },
    ];
    const s = buildIncomeStatement(rows);
    expect(s.retiredRows).toEqual([{ kind: 'credit_card', label: '信用卡', amount: 12000 }]);
    expect(s.operatingExpenseRows).toEqual([{ kind: 'other_expense', label: '其他支出', amount: 3000 }]);
  });

  it('空陣列全零,不炸', () => {
    const s = buildIncomeStatement([]);
    expect(s.net).toBe(0);
    expect(s.operatingNet).toBe(0);
    expect(s.nonOperatingNet).toBe(0);
  });
});
