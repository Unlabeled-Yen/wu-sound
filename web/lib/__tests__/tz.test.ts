import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { taipeiCurrentQuarterStr, taipeiCurrentYear } from '../tz';

describe('taipeiCurrentYear / taipeiCurrentQuarterStr — R-AMT5', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('台北跨年當下(UTC 還是去年),年份不可算成去年', () => {
    // 2026-01-01 00:30 台北時間 = 2025-12-31 16:30 UTC——舊版用 getUTCFullYear() 會算成 2025。
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-12-31T16:30:00Z'));
    expect(taipeiCurrentYear()).toBe(2026);
  });

  it('台北跨季當下(UTC 還是上一季的月份),季度不可算錯', () => {
    // 2026-04-01 00:30 台北時間(Q2 第一天)= 2026-03-31 16:30 UTC(仍是 3 月,Q1)。
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-31T16:30:00Z'));
    expect(taipeiCurrentQuarterStr()).toBe('2026-Q2');
  });
});
