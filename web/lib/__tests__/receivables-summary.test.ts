import { describe, expect, it } from 'vitest';
import { summarizeReceivables } from '../receivables-query';
import type { ReceivableWithRemaining } from '../receivables-query';

function row(overrides: Partial<ReceivableWithRemaining>): ReceivableWithRemaining {
  return {
    id: overrides.id ?? 'r1',
    direction: 'receivable',
    party: '客戶',
    site_id: null,
    total_amount_twd: 1000,
    memo: null,
    status: 'open',
    created_by: 'u1',
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    settled_twd: 0,
    remaining_twd: 1000,
    overpaid: false,
    ...overrides,
  };
}

describe('summarizeReceivables', () => {
  it('remaining = total - settled', () => {
    const s = summarizeReceivables([
      row({ direction: 'receivable', total_amount_twd: 30000, settled_twd: 10000, remaining_twd: 20000 }),
    ]);
    expect(s.receivableOpenTotal).toBe(20000);
  });

  it('超收不倒扣總額——在手合計對 remaining 取 Math.max(0, …)', () => {
    const s = summarizeReceivables([
      row({ direction: 'receivable', total_amount_twd: 1000, settled_twd: 1500, remaining_twd: -500, overpaid: true }),
      row({ id: 'r2', direction: 'receivable', total_amount_twd: 2000, settled_twd: 500, remaining_twd: 1500 }),
    ]);
    // 超收那筆對總額貢獻 0,不是 -500,不然總額會被拉低反而更好看
    expect(s.receivableOpenTotal).toBe(1500);
    expect(s.overpaidCount).toBe(1);
  });

  it('只有 status=open 計入在手合計', () => {
    const s = summarizeReceivables([
      row({ status: 'closed', remaining_twd: 0 }),
      row({ id: 'r2', status: 'open', remaining_twd: 500 }),
    ]);
    expect(s.receivableOpenTotal).toBe(500);
    expect(s.receivableOpenCount).toBe(1);
  });

  it('應收應付分開累計,不互相污染', () => {
    const s = summarizeReceivables([
      row({ direction: 'receivable', remaining_twd: 1000 }),
      row({ id: 'p1', direction: 'payable', remaining_twd: 2000 }),
    ]);
    expect(s.receivableOpenTotal).toBe(1000);
    expect(s.payableOpenTotal).toBe(2000);
  });

  it('空陣列回全零', () => {
    const s = summarizeReceivables([]);
    expect(s).toEqual({
      receivableOpenTotal: 0,
      payableOpenTotal: 0,
      receivableOpenCount: 0,
      payableOpenCount: 0,
      overpaidCount: 0,
    });
  });

  it('已結清的超收不計入 overpaidCount(不是老闆現在要處理的事)', () => {
    const s = summarizeReceivables([
      row({ status: 'closed', overpaid: true, remaining_twd: -100 }),
    ]);
    expect(s.overpaidCount).toBe(0);
  });
});
