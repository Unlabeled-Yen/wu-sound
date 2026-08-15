import { describe, expect, it } from 'vitest';
import { resolveMonthlySalary } from '../payroll';
import type { PayProfile } from '../types';

function profile(overrides: Partial<PayProfile>): PayProfile {
  return {
    id: 'p1',
    user_id: 'u1',
    monthly_salary_twd: 30000,
    effective_from: '2026-01-01',
    created_by: 'boss',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('resolveMonthlySalary', () => {
  it('取生效日 <= 該月最後一天裡最新的一筆', () => {
    const profiles = [
      profile({ id: 'a', effective_from: '2026-01-01', monthly_salary_twd: 30000 }),
      profile({ id: 'b', effective_from: '2026-06-01', monthly_salary_twd: 35000 }),
    ];
    expect(resolveMonthlySalary(profiles, 'u1', '2026-08-31')).toBe(35000);
  });

  it('生效日在該月之後的不算,回傳較早那筆', () => {
    const profiles = [
      profile({ id: 'a', effective_from: '2026-01-01', monthly_salary_twd: 30000 }),
      profile({ id: 'b', effective_from: '2026-09-01', monthly_salary_twd: 35000 }),
    ];
    expect(resolveMonthlySalary(profiles, 'u1', '2026-08-31')).toBe(30000);
  });

  it('完全沒有 profile 回傳 null,不猜任何金額', () => {
    expect(resolveMonthlySalary([], 'u1', '2026-08-31')).toBeNull();
  });

  it('只挑對應 user_id 的資料', () => {
    const profiles = [profile({ id: 'a', user_id: 'other', effective_from: '2026-01-01' })];
    expect(resolveMonthlySalary(profiles, 'u1', '2026-08-31')).toBeNull();
  });
});
