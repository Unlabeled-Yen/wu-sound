import { describe, expect, it } from 'vitest';
import {
  resolvePeriodForDimension, isPeriodDisabledForDimension,
  taxPeriodLabel, taxPeriodRange, currentTaxPeriod,
} from '../report-period-dimension';

describe('resolvePeriodForDimension', () => {
  it('按案子強制整案期,且帶原因(禁止靜默切換)', () => {
    const r = resolvePeriodForDimension('site', 'month');
    expect(r.period).toBe('project');
    expect(r.forceReason).toContain('整案期');
  });

  it('按內外帳強制稅務期,且帶原因', () => {
    const r = resolvePeriodForDimension('books', 'year');
    expect(r.period).toBe('tax');
    expect(r.forceReason).toContain('營業稅');
  });

  it('按類別維持使用者選的期間,不強制', () => {
    const r = resolvePeriodForDimension('category', 'quarter');
    expect(r.period).toBe('quarter');
    expect(r.forceReason).toBeNull();
  });

  it('按類別選了不合法的期間(如 project)時退回預設值', () => {
    const r = resolvePeriodForDimension('category', 'project');
    expect(r.period).toBe('month');
    expect(r.forceReason).toBeNull();
  });

  it('按月(趨勢)只允許年/自訂,選 month 會退回年', () => {
    const r = resolvePeriodForDimension('month', 'month');
    expect(r.period).toBe('year');
  });
});

describe('isPeriodDisabledForDimension', () => {
  it('按案子時,月/季/年/稅務/自訂全部停用', () => {
    for (const p of ['month', 'quarter', 'year', 'tax', 'custom'] as const) {
      expect(isPeriodDisabledForDimension('site', p)).toBe(true);
    }
    expect(isPeriodDisabledForDimension('site', 'project')).toBe(false);
  });

  it('按類別時,稅務期與整案期停用,其餘可選', () => {
    expect(isPeriodDisabledForDimension('category', 'tax')).toBe(true);
    expect(isPeriodDisabledForDimension('category', 'project')).toBe(true);
    expect(isPeriodDisabledForDimension('category', 'month')).toBe(false);
  });
});

describe('稅務兩月期', () => {
  it('05 起算的期別涵蓋 05-06 月', () => {
    const { from, to } = taxPeriodRange('2026-05');
    expect(from).toBe('2026-05-01');
    expect(to).toBe('2026-06-30');
  });

  it('label 標出年+期別+月份範圍', () => {
    expect(taxPeriodLabel('2026-05')).toBe('2026 年第 03 期(05-06 月)');
  });

  it('currentTaxPeriod 把偶數月併進前一個奇數月起算', () => {
    // 依台北時間執行,只驗證回傳格式與奇數月起算這個不變量
    const v = currentTaxPeriod();
    expect(v).toMatch(/^\d{4}-\d{2}$/);
    const month = Number(v.split('-')[1]);
    expect(month % 2).toBe(1);
  });
});
