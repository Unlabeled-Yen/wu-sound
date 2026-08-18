import { taipeiCurrentMonthStr, taipeiCurrentQuarterStr, taipeiCurrentYear } from '@/lib/tz';

export type Mode = 'all' | 'settled' | 'receivable' | 'payable' | 'payroll' | 'reports';
export const NO_SITE = '__none__';
export type ReportPeriodType = 'month' | 'quarter' | 'year';

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
  rp?: string; // 報表中心舊版(A 批):期間類型 month/quarter/year,22c 定案後不再新增用途,保留給既有連結相容
  rv?: string; // 報表中心舊版(A 批):期間值,格式隨 rp 而定(YYYY-MM / YYYY-Q# / YYYY)
  dim?: string; // 報表中心 22c:維度旋鈕(category/site/person/books/month)
  period?: string; // 報表中心 22c:期間旋鈕(month/quarter/year/tax/project/custom)
  pv?: string; // 報表中心 22c:期間值,格式隨 period 而定
  drill?: string; // 報表中心 22c:目前展開的就地抽屜(kind 或 site_id),伺服器端 Link 狀態,不是 client state
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
  if (merged.rp && merged.rp !== 'month') p.set('rp', merged.rp);
  if (merged.rv) p.set('rv', merged.rv);
  if (merged.dim && merged.dim !== 'category') p.set('dim', merged.dim);
  if (merged.period && merged.period !== 'month') p.set('period', merged.period);
  if (merged.pv) p.set('pv', merged.pv);
  if (merged.drill) p.set('drill', merged.drill);
  const q = p.toString();
  return q ? `/boss/ledger?${q}` : '/boss/ledger';
}

// 報表中心的期間範圍——月/季/年三種粒度算出同一組 { from, to }。
export function reportPeriodRange(rp: ReportPeriodType, rv: string): { from: string; to: string; label: string } {
  if (rp === 'year') {
    const y = Number(rv);
    return { from: `${y}-01-01`, to: `${y}-12-31`, label: `${y} 年` };
  }
  if (rp === 'quarter') {
    const [yStr, qStr] = rv.split('-Q');
    const y = Number(yStr);
    const q = Number(qStr);
    const startMonth = (q - 1) * 3 + 1;
    const from = `${y}-${String(startMonth).padStart(2, '0')}-01`;
    const endMonth = startMonth + 2;
    const lastDay = new Date(Date.UTC(y, endMonth, 0)).getUTCDate();
    const to = `${y}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { from, to, label: `${y} 年第 ${q} 季` };
  }
  const { from, to } = monthRange(rv);
  return { from, to, label: rv };
}

// R-AMT5(ledger-master-spec.md §3.1):期間一律走台北時區,不可用 UTC 方法推算——
// 舊版用 Date.UTC 系列,台北時間 00:00–07:59 之間會把「本年/本季」算成前一期。
export function currentQuarter(): string {
  return taipeiCurrentQuarterStr();
}

export function shiftQuarter(rv: string, delta: number): string {
  const [yStr, qStr] = rv.split('-Q');
  const idx = Number(yStr) * 4 + (Number(qStr) - 1) + delta;
  const y = Math.floor(idx / 4);
  const q = (idx % 4) + 1;
  return `${y}-Q${q}`;
}

export function currentYear(): string {
  return String(taipeiCurrentYear());
}

export const fmt = (n: number) => n.toLocaleString('zh-TW');
