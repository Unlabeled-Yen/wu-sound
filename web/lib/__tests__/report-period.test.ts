import { describe, expect, it } from 'vitest';
import { periodRange, shiftPeriod, isValidPeriodValue } from '../report-period';

describe('periodRange', () => {
  it('月:回傳當月起訖', () => {
    expect(periodRange('month', '2026-08')).toEqual({ from: '2026-08-01', to: '2026-09-01', label: '2026-08' });
  });
  it('月:12 月跨年', () => {
    expect(periodRange('month', '2026-12')).toEqual({ from: '2026-12-01', to: '2027-01-01', label: '2026-12' });
  });
  it('季:Q3 起訖', () => {
    expect(periodRange('quarter', '2026-Q3')).toEqual({ from: '2026-07-01', to: '2026-10-01', label: '2026 Q3' });
  });
  it('季:Q4 跨年', () => {
    expect(periodRange('quarter', '2026-Q4')).toEqual({ from: '2026-10-01', to: '2027-01-01', label: '2026 Q4' });
  });
  it('年:起訖', () => {
    expect(periodRange('year', '2026')).toEqual({ from: '2026-01-01', to: '2027-01-01', label: '2026 年' });
  });
});

describe('shiftPeriod', () => {
  it('月:向前跨年', () => {
    expect(shiftPeriod('month', '2026-01', -1)).toBe('2025-12');
  });
  it('月:向後跨年', () => {
    expect(shiftPeriod('month', '2026-12', 1)).toBe('2027-01');
  });
  it('季:向前跨年', () => {
    expect(shiftPeriod('quarter', '2026-Q1', -1)).toBe('2025-Q4');
  });
  it('季:向後跨年', () => {
    expect(shiftPeriod('quarter', '2026-Q4', 1)).toBe('2027-Q1');
  });
  it('年:前後移動', () => {
    expect(shiftPeriod('year', '2026', 1)).toBe('2027');
    expect(shiftPeriod('year', '2026', -1)).toBe('2025');
  });
});

describe('isValidPeriodValue', () => {
  it('驗證各類型格式', () => {
    expect(isValidPeriodValue('month', '2026-08')).toBe(true);
    expect(isValidPeriodValue('month', '2026-8')).toBe(false);
    expect(isValidPeriodValue('quarter', '2026-Q1')).toBe(true);
    expect(isValidPeriodValue('quarter', '2026-Q5')).toBe(false);
    expect(isValidPeriodValue('year', '2026')).toBe(true);
    expect(isValidPeriodValue('year', '26')).toBe(false);
  });
});
