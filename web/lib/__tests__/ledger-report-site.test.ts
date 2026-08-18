import { describe, expect, it } from 'vitest';
import { aggregateSiteReport, type SiteReportEntryRow, type SiteReportExpenseRow } from '../ledger-report-site';

const names = new Map([['s1', '磐頂長老教會'], ['s2', '斗六旌旗']]);

describe('aggregateSiteReport', () => {
  it('恆等式:Σ各案(含未歸類)= 合計,逐欄成立', () => {
    const entries: SiteReportEntryRow[] = [
      { site_id: 's1', direction: 'income', kind: 'project', amount_twd: 500000 },
      { site_id: 's1', direction: 'expense', kind: 'goods', amount_twd: 120000 },
      { site_id: 's2', direction: 'income', kind: 'project', amount_twd: 300000 },
      { site_id: null, direction: 'expense', kind: 'other_expense', amount_twd: 5000 }, // 沒掛案子
    ];
    const expenses: SiteReportExpenseRow[] = [
      { site_id: 's1', amount_twd: 8000 },
    ];
    const r = aggregateSiteReport(entries, names, expenses);
    const sumField = (f: 'revenue' | 'directCost' | 'advance' | 'margin') =>
      r.rows.reduce((s, row) => s + row[f], 0) + (r.residual ? r.residual[f] : 0);
    expect(sumField('revenue')).toBe(r.total.revenue);
    expect(sumField('directCost')).toBe(r.total.directCost);
    expect(sumField('advance')).toBe(r.total.advance);
    expect(sumField('margin')).toBe(r.total.margin);
  });

  it('借款/投資/健檢/已退役類別不進任何案子的損益', () => {
    const entries: SiteReportEntryRow[] = [
      { site_id: 's1', direction: 'income', kind: 'loan', amount_twd: 1000000 },
      { site_id: 's1', direction: 'expense', kind: 'investment', amount_twd: 200000 },
      { site_id: 's1', direction: 'expense', kind: 'credit_card', amount_twd: 3000 },
    ];
    const r = aggregateSiteReport(entries, names, []);
    expect(r.rows).toEqual([]);
    expect(r.residual).toBeNull();
  });

  it('代墊(reimbursement)不計入直接成本,只算在 advance', () => {
    const entries: SiteReportEntryRow[] = [
      { site_id: 's1', direction: 'expense', kind: 'reimbursement', amount_twd: 9999 },
    ];
    const r = aggregateSiteReport(entries, names, []);
    expect(r.rows[0].directCost).toBe(0);
    // reimbursement 不從 ledger_entries 讀代墊(見 lib 檔案頂部註解),
    // 這裡故意不傳 expenses,驗證它不會被 ledger_entries 的 reimbursement 分錄污染。
    expect(r.rows[0].advance).toBe(0);
  });

  it('沒有殘差時 residual 為 null,不是顯示 0(九種狀態之一)', () => {
    const entries: SiteReportEntryRow[] = [
      { site_id: 's1', direction: 'income', kind: 'project', amount_twd: 1000 },
    ];
    const r = aggregateSiteReport(entries, names, []);
    expect(r.residual).toBeNull();
  });

  it('只有未歸類的代墊也要讓殘差列出現(不能因為只有 expenses 沒有 ledger_entries 就消失)', () => {
    const r = aggregateSiteReport([], names, [{ site_id: null, amount_twd: 2000 }]);
    expect(r.residual).not.toBeNull();
    expect(r.residual!.advance).toBe(2000);
    expect(r.total.advance).toBe(2000);
  });

  it('revenue=0 時毛利率為 null(不適用),不是除以零的 Infinity/NaN', () => {
    const entries: SiteReportEntryRow[] = [
      { site_id: 's1', direction: 'expense', kind: 'goods', amount_twd: 5000 },
    ];
    const r = aggregateSiteReport(entries, names, []);
    expect(r.rows[0].marginRate).toBeNull();
  });

  it('案場已刪除(site_id 存在但查不到名字)時仍要出現,標「已刪除案場」', () => {
    const entries: SiteReportEntryRow[] = [
      { site_id: 'ghost', direction: 'income', kind: 'project', amount_twd: 1000 },
    ];
    const r = aggregateSiteReport(entries, names, []);
    expect(r.rows[0].label).toBe('(已刪除案場)');
  });
});
