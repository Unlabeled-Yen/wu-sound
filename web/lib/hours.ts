// 工時配對引擎:open-questions.md Q1 暫定口徑,尚未經老闆正式拍板。
// 口徑:同一人同一(當地)日曆日內,依時間排序,每對 in→out 相加為當日工時。
// 有進無出 / 有出無進 → 該日不計入工時,回報在 unpaired 供 UI loud 顯示,絕不靜默估算。

export interface ClockinLike {
  ts: string; // ISO timestamp
  type: 'in' | 'out';
}

export interface HourPair {
  in: string;
  out: string;
  hours: number;
}

export interface DayHoursResult {
  dateKey: string; // 當地日期 YYYY-MM-DD,依 clockin 的本地時區
  pairs: HourPair[];
  totalHours: number;
  unpaired: ClockinLike[]; // 落單的 in 或 out,依原順序
}

function localDateKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 依本地日期分組後,逐日配對。輸入不用預先排序。
export function pairClockinsByDay(clockins: ClockinLike[]): DayHoursResult[] {
  const byDay = new Map<string, ClockinLike[]>();
  for (const c of clockins) {
    const key = localDateKey(c.ts);
    const arr = byDay.get(key) ?? [];
    arr.push(c);
    byDay.set(key, arr);
  }

  const results: DayHoursResult[] = [];
  for (const [dateKey, list] of byDay) {
    const sorted = [...list].sort((a, b) => a.ts.localeCompare(b.ts));
    const pairs: HourPair[] = [];
    const unpaired: ClockinLike[] = [];
    let pendingIn: ClockinLike | null = null;

    for (const c of sorted) {
      if (c.type === 'in') {
        if (pendingIn) unpaired.push(pendingIn); // 連續兩個 in:前一個落單
        pendingIn = c;
      } else {
        if (pendingIn) {
          const ms = new Date(c.ts).getTime() - new Date(pendingIn.ts).getTime();
          const hours = ms / 1000 / 60 / 60;
          pairs.push({ in: pendingIn.ts, out: c.ts, hours: Math.round(hours * 100) / 100 });
          pendingIn = null;
        } else {
          unpaired.push(c); // 有出無進
        }
      }
    }
    if (pendingIn) unpaired.push(pendingIn); // 收尾還有進沒出

    const totalHours = Math.round(pairs.reduce((s, p) => s + p.hours, 0) * 100) / 100;
    results.push({ dateKey, pairs, totalHours, unpaired });
  }

  return results.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

// 一段期間(如當月)的總工時 + 全部未配對清單,供報表/月結檢核用。
export function summarizeHours(clockins: ClockinLike[]): {
  totalHours: number;
  days: DayHoursResult[];
  hasUnpaired: boolean;
} {
  const days = pairClockinsByDay(clockins);
  const totalHours = Math.round(days.reduce((s, d) => s + d.totalHours, 0) * 100) / 100;
  const hasUnpaired = days.some((d) => d.unpaired.length > 0);
  return { totalHours, days, hasUnpaired };
}
