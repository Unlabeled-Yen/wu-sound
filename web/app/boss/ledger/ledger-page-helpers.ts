import { taipeiCurrentMonthStr } from '@/lib/tz';

export type Mode = 'all' | 'settled' | 'receivable' | 'payable' | 'payroll';
export const NO_SITE = '__none__';

export function currentMonth(): string {
  return taipeiCurrentMonthStr();
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const from = `${y}-${String(m).padStart(2, '0')}-01`;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const to = `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  return { from, to };
}

export interface SP {
  month?: string; // YYYY-MM,或 'all'(不限月份,待處理提示點進來用)
  mode?: string;
  site_id?: string;
  kind?: string;
  invoice?: string;
  to_check?: string;
  ext?: string; // internal/external,不填=全部
  show_voided?: string;
}

export function buildHref(base: SP, overrides: Partial<SP>): string {
  const p = new URLSearchParams();
  const merged: SP = { ...base, ...overrides };
  if (merged.month && merged.month !== currentMonth()) p.set('month', merged.month);
  if (merged.mode && merged.mode !== 'all') p.set('mode', merged.mode);
  if (merged.site_id) p.set('site_id', merged.site_id);
  if (merged.kind) p.set('kind', merged.kind);
  if (merged.invoice) p.set('invoice', merged.invoice);
  if (merged.to_check === '1') p.set('to_check', '1');
  if (merged.ext) p.set('ext', merged.ext);
  if (merged.show_voided === '1') p.set('show_voided', '1');
  const q = p.toString();
  return q ? `/boss/ledger?${q}` : '/boss/ledger';
}

export const fmt = (n: number) => n.toLocaleString('zh-TW');
