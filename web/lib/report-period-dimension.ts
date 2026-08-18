import { taipeiCurrentMonthStr, taipeiCurrentQuarterStr, taipeiCurrentYear } from './tz';

// 報表中心(22c 一張表 × 兩個旋鈕)的期間/維度狀態機。
// 見 docs/design_handoff_wu_sound/17-reports-center.md §4——
// 粒度衝突用「連動規則」解決,不是四個分頁各養一組選擇器(Q2 的答案)。

export type PeriodType = 'month' | 'quarter' | 'year' | 'tax' | 'project' | 'custom';
export type Dimension = 'category' | 'site' | 'person' | 'books' | 'month';

export const PERIOD_OPTIONS: Array<{ key: PeriodType; label: string }> = [
  { key: 'month', label: '月' },
  { key: 'quarter', label: '季' },
  { key: 'year', label: '年' },
  { key: 'tax', label: '稅務期(兩月)' },
  { key: 'project', label: '整案期' },
  { key: 'custom', label: '自訂' },
];

export const DIMENSION_OPTIONS: Array<{ key: Dimension; label: string; equals: string }> = [
  { key: 'category', label: '按類別', equals: '傳統的損益表' },
  { key: 'site', label: '按案子', equals: '傳統的專案損益表' },
  { key: 'person', label: '按人', equals: '零用金彙總(依人)' },
  { key: 'books', label: '按內外帳', equals: '營業稅申報彙總' },
  { key: 'month', label: '按月', equals: '趨勢' },
];

export interface LinkageRule {
  periodAllowed?: PeriodType[];
  periodForced?: PeriodType;
  periodDisabled: PeriodType[];
  default?: PeriodType;
  hint?: string; // 強制改期間時的原因,必須顯示,不可靜默切換(R-forbidden)
}

export const DIMENSION_LINKAGE: Record<Dimension, LinkageRule> = {
  category: {
    periodAllowed: ['month', 'quarter', 'year', 'custom'],
    periodDisabled: ['tax', 'project'],
    default: 'month',
  },
  site: {
    periodForced: 'project',
    periodDisabled: ['month', 'quarter', 'year', 'tax', 'custom'],
    hint: '期間已自動改為「整案期」——案子的起訖不落在月界上',
  },
  person: {
    periodAllowed: ['month', 'quarter', 'year', 'custom'],
    periodDisabled: ['tax', 'project'],
    default: 'month',
  },
  books: {
    periodForced: 'tax',
    periodDisabled: ['month', 'quarter', 'year', 'project', 'custom'],
    hint: '營業稅以兩月期申報,期間已鎖定',
  },
  month: {
    periodAllowed: ['year', 'custom'],
    periodDisabled: ['month', 'tax', 'project'],
    default: 'year',
  },
};

/** 切維度時,依連動規則決定新期間;forceReason 非 null 時代表這是被強制切換(要顯示原因)。 */
export function resolvePeriodForDimension(
  dim: Dimension,
  currentPeriod: PeriodType,
): { period: PeriodType; forceReason: string | null } {
  const rule = DIMENSION_LINKAGE[dim];
  if (rule.periodForced) {
    return { period: rule.periodForced, forceReason: rule.hint ?? null };
  }
  if (rule.periodAllowed && rule.periodAllowed.includes(currentPeriod)) {
    return { period: currentPeriod, forceReason: null };
  }
  return { period: rule.default ?? 'month', forceReason: null };
}

export function isPeriodDisabledForDimension(dim: Dimension, period: PeriodType): boolean {
  return DIMENSION_LINKAGE[dim].periodDisabled.includes(period);
}

export function currentPeriodValue(pt: PeriodType): string {
  if (pt === 'year') return String(taipeiCurrentYear());
  if (pt === 'quarter') return taipeiCurrentQuarterStr();
  if (pt === 'tax') return currentTaxPeriod();
  if (pt === 'project' || pt === 'custom') return '';
  return taipeiCurrentMonthStr();
}

// 台灣營業稅兩月一期:1-2月=期01、3-4月=期02...固定用起始月表示,例如 "2026-05" 代表 05-06 期。
export function currentTaxPeriod(): string {
  const [y, m] = taipeiCurrentMonthStr().split('-').map(Number);
  const startMonth = m % 2 === 0 ? m - 1 : m;
  return `${y}-${String(startMonth).padStart(2, '0')}`;
}

export function taxPeriodLabel(value: string): string {
  const [y, mStr] = value.split('-');
  const m = Number(mStr);
  const period = Math.ceil(m / 2);
  return `${y} 年第 ${String(period).padStart(2, '0')} 期(${mStr}-${String(m + 1).padStart(2, '0')} 月)`;
}

export function taxPeriodRange(value: string): { from: string; to: string } {
  const [yStr, mStr] = value.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const from = `${yStr}-${mStr}-01`;
  const endMonth = m + 1;
  const lastDay = new Date(Date.UTC(y, endMonth, 0)).getUTCDate();
  const to = `${yStr}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}
