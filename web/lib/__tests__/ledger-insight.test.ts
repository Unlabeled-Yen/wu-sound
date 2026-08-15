import { describe, expect, it } from 'vitest';
import {
  generateLedgerInsight, type LedgerInsightInput,
  buildLedgerInsightTodo, buildLedgerInsightChange, buildLedgerInsightLink,
} from '../ledger-insight';

const base: LedgerInsightInput = {
  month: '2026-07',
  entryCount: 21,
  unsettledCount: 2,
  incomeFace: 300000,
  expenseFace: 214000,
  netFace: 86000,
  netSettled: 0,
  overdueIncomeTwd: 0,
  overdueIncomeCount: 0,
  toCheckCount: 0,
  toIssueCount: 0,
  topIncomeLabel: null,
  topIncomeAmount: 0,
};

describe('generateLedgerInsight', () => {
  it('負淨額時 headline 要點名警示,不是照常語氣', () => {
    const i = generateLedgerInsight({ ...base, netFace: -5000 });
    expect(i.headline).toContain('負');
    expect(i.headline).toContain('要注意');
  });

  it('已逾期應收優先成為建議動作,蓋過待開發票', () => {
    const i = generateLedgerInsight({ ...base, overdueIncomeCount: 2, overdueIncomeTwd: 40000, toIssueCount: 3 });
    expect(i.action?.label).toContain('逾期');
    expect(i.secondary.some((s) => s.includes('逾期'))).toBe(true);
  });

  it('沒有任何待辦時 action 為 null,不硬湊一個動作', () => {
    const i = generateLedgerInsight(base);
    expect(i.action).toBeNull();
  });

  it('basisNote 標明是規則式摘要,不是生成式模型', () => {
    const i = generateLedgerInsight(base);
    expect(i.basisNote).toContain('規則式摘要');
    expect(i.basisNote).toContain('21 筆分錄');
  });
});

describe('buildLedgerInsightTodo', () => {
  it('殘差公式跟 NetBand 一致:gap - (應收-應付)', () => {
    // netFace-netSettled=100, 應收-應付=95, 殘差=5
    const t = buildLedgerInsightTodo({
      netFace: 200, netSettled: 100, incomeUnsettled: 100, expenseUnsettled: 5,
      missingCustomerAmount: null, agingRows: [], todayStr: '2026-08-15',
    });
    expect(t.residual?.amountTwd).toBe(5);
  });

  it('殘差小於 1 元視為對得起來,不顯示卡', () => {
    const t = buildLedgerInsightTodo({
      netFace: 100, netSettled: 0, incomeUnsettled: 100, expenseUnsettled: 0,
      missingCustomerAmount: null, agingRows: [], todayStr: '2026-08-15',
    });
    expect(t.residual).toBeNull();
  });

  it('帳齡分桶:沒有約定日期算未到期,不可預設成已逾期', () => {
    const t = buildLedgerInsightTodo({
      netFace: 0, netSettled: 0, incomeUnsettled: 0, expenseUnsettled: 0,
      missingCustomerAmount: null,
      agingRows: [{ agreedDueDate: null }, { agreedDueDate: '2026-08-01' }, { agreedDueDate: '2026-08-20' }, { agreedDueDate: '2026-10-01' }],
      todayStr: '2026-08-15',
    });
    expect(t.aging).toEqual({ notDue: 2, within30: 1, overdue: 1 });
  });

  it('沒有任何待補資料時三張卡都是 null', () => {
    const t = buildLedgerInsightTodo({
      netFace: 0, netSettled: 0, incomeUnsettled: 0, expenseUnsettled: 0,
      missingCustomerAmount: null, agingRows: [], todayStr: '2026-08-15',
    });
    expect(t.residual).toBeNull();
    expect(t.missingCustomer).toBeNull();
    expect(t.aging).toBeNull();
  });
});

describe('buildLedgerInsightChange', () => {
  it('六個月淨額按月加總,扣手續費', () => {
    const c = buildLedgerInsightChange({
      entries: [
        { occurred_on: '2026-08-01', direction: 'income', amount_twd: 1000, fee_twd: 10 },
        { occurred_on: '2026-08-05', direction: 'expense', amount_twd: 200, fee_twd: 0 },
        { occurred_on: '2026-07-01', direction: 'income', amount_twd: 500, fee_twd: 0 },
      ],
      collections: [],
      monthsBack: 6,
      todayStr: '2026-08-15',
    });
    expect(c.months).toHaveLength(6);
    expect(c.months[5]).toEqual({ month: '2026-08', net: 1000 - 200 - 10 });
    expect(c.months[4]).toEqual({ month: '2026-07', net: 500 });
  });

  it('少於兩個月資料時不算月比月(避免拿不存在的上月比較)', () => {
    const c = buildLedgerInsightChange({ entries: [], collections: [], monthsBack: 1, todayStr: '2026-08-15' });
    expect(c.mom).toBeNull();
  });

  it('沒有收款資料時 collectionDays 為 null,不編一個平均天數出來', () => {
    const c = buildLedgerInsightChange({ entries: [], collections: [], monthsBack: 6, todayStr: '2026-08-15' });
    expect(c.collectionDays).toBeNull();
  });

  it('平均收款天數:收款早於約定建立日視為異常資料,不計入', () => {
    const c = buildLedgerInsightChange({
      entries: [],
      collections: [
        { receivableCreatedAt: '2026-08-01', settledOn: '2026-08-11' }, // 10 天
        { receivableCreatedAt: '2026-08-05', settledOn: '2026-08-01' }, // 異常,跳過
      ],
      monthsBack: 1,
      todayStr: '2026-08-15',
    });
    expect(c.collectionDays?.currentAvgDays).toBe(10);
  });
});

describe('buildLedgerInsightLink', () => {
  it('同一案子應付早於應收,回報最大缺口那一件', () => {
    const link = buildLedgerInsightLink({
      openPayables: [
        { site_id: 'siteA', siteLabel: '案A', agreed_due_date: '2026-08-01', remaining_twd: 100 },
        { site_id: 'siteB', siteLabel: '案B', agreed_due_date: '2026-08-01', remaining_twd: 50 },
      ],
      openReceivables: [
        { site_id: 'siteA', siteLabel: '案A', agreed_due_date: '2026-08-24', remaining_twd: 200 }, // 缺口 23 天
        { site_id: 'siteB', siteLabel: '案B', agreed_due_date: '2026-08-05', remaining_twd: 80 }, // 缺口 4 天
      ],
    });
    expect(link?.siteId).toBe('siteA');
    expect(link?.gapDays).toBe(23);
  });

  it('應收比應付早(先收後付)不算「錢先出後進」', () => {
    const link = buildLedgerInsightLink({
      openPayables: [{ site_id: 'siteA', siteLabel: '案A', agreed_due_date: '2026-08-20', remaining_twd: 100 }],
      openReceivables: [{ site_id: 'siteA', siteLabel: '案A', agreed_due_date: '2026-08-01', remaining_twd: 200 }],
    });
    expect(link).toBeNull();
  });

  it('沒有約定日期的列不參與比較', () => {
    const link = buildLedgerInsightLink({
      openPayables: [{ site_id: 'siteA', siteLabel: '案A', agreed_due_date: null, remaining_twd: 100 }],
      openReceivables: [{ site_id: 'siteA', siteLabel: '案A', agreed_due_date: '2026-08-24', remaining_twd: 200 }],
    });
    expect(link).toBeNull();
  });
});
