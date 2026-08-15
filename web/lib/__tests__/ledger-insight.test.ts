import { describe, expect, it } from 'vitest';
import { generateLedgerInsight, type LedgerInsightInput } from '../ledger-insight';

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
