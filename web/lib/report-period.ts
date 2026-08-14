import { taipeiCurrentMonthStr, taipeiCurrentYear } from './tz';

export type PeriodType = 'month' | 'quarter' | 'year';

export interface PeriodRange {
  from: string; // YYYY-MM-DD inclusive
  to: string; // YYYY-MM-DD exclusive
  label: string;
}

export function currentPeriodValue(type: PeriodType): string {
  const y = taipeiCurrentYear();
  const monthStr = taipeiCurrentMonthStr();
  const m = Number(monthStr.slice(5, 7));
  if (type === 'year') return String(y);
  if (type === 'quarter') return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
  return monthStr;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function periodRange(type: PeriodType, value: string): PeriodRange {
  if (type === 'year') {
    const y = parseInt(value, 10);
    return { from: `${y}-01-01`, to: `${y + 1}-01-01`, label: `${y} 年` };
  }
  if (type === 'quarter') {
    const m = /^(\d{4})-Q([1-4])$/.exec(value);
    const y = m ? parseInt(m[1], 10) : taipeiCurrentYear();
    const q = m ? parseInt(m[2], 10) : 1;
    const startMonth = (q - 1) * 3 + 1;
    const endMonth = startMonth + 3;
    const endY = endMonth > 12 ? y + 1 : y;
    const endM = endMonth > 12 ? endMonth - 12 : endMonth;
    return { from: `${y}-${pad2(startMonth)}-01`, to: `${endY}-${pad2(endM)}-01`, label: `${y} Q${q}` };
  }
  const mm = /^(\d{4})-(\d{2})$/.exec(value);
  const y = mm ? parseInt(mm[1], 10) : taipeiCurrentYear();
  const mo = mm ? parseInt(mm[2], 10) : 1;
  const nextY = mo === 12 ? y + 1 : y;
  const nextM = mo === 12 ? 1 : mo + 1;
  return { from: `${y}-${pad2(mo)}-01`, to: `${nextY}-${pad2(nextM)}-01`, label: `${y}-${pad2(mo)}` };
}

export function shiftPeriod(type: PeriodType, value: string, delta: number): string {
  if (type === 'year') {
    const y = parseInt(value, 10);
    return String(y + delta);
  }
  if (type === 'quarter') {
    const m = /^(\d{4})-Q([1-4])$/.exec(value);
    const y = m ? parseInt(m[1], 10) : taipeiCurrentYear();
    const q = m ? parseInt(m[2], 10) : 1;
    const total = y * 4 + (q - 1) + delta;
    const ny = Math.floor(total / 4);
    const nq = (total % 4) + 1;
    return `${ny}-Q${nq}`;
  }
  const mm = /^(\d{4})-(\d{2})$/.exec(value);
  const y = mm ? parseInt(mm[1], 10) : taipeiCurrentYear();
  const mo = mm ? parseInt(mm[2], 10) : 1;
  const total = y * 12 + (mo - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${pad2(nm)}`;
}

export function isValidPeriodValue(type: PeriodType, value: string): boolean {
  if (type === 'year') return /^\d{4}$/.test(value);
  if (type === 'quarter') return /^\d{4}-Q[1-4]$/.test(value);
  return /^\d{4}-\d{2}$/.test(value);
}
