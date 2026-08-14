/**
 * 全站「今天/本月」一律走這裡,固定算台北時間。
 * 舊碼混用 getUTCFullYear()(伺服器 UTC)與 new Date().getFullYear()(伺服器本地時區,
 * 部署環境常也是 UTC)——兩邊都不是台北時間,月初交界會讓列表頁與表單頁對不上月份。
 */
const TZ = 'Asia/Taipei';

function taipeiParts(d: Date): { y: number; m: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get('year'), m: get('month'), day: get('day') };
}

export function taipeiTodayStr(): string {
  const { y, m, day } = taipeiParts(new Date());
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function taipeiCurrentMonthStr(): string {
  const { y, m } = taipeiParts(new Date());
  return `${y}-${String(m).padStart(2, '0')}`;
}

export function taipeiCurrentYear(): number {
  return taipeiParts(new Date()).y;
}
