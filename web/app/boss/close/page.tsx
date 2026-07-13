import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { ExpenseRecord } from '@/lib/types';
import LockButton from './LockButton';

export const dynamic = 'force-dynamic';

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthOf(row: ExpenseRecord): string {
  const src = row.spent_on ?? row.captured_at;
  return String(src).slice(0, 7);
}

interface JoinedRow extends ExpenseRecord {
  users?: { name?: string };
}

export default async function BossClosePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const sp = await searchParams;
  const month =
    sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : currentMonth();

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('expenses')
    .select('*, users!inner(name)')
    .in('status', ['draft', 'submitted', 'confirmed'])
    .order('captured_at', { ascending: true });
  if (error) throw new Error(`Supabase 查詢失敗: ${error.message}`);

  const all = ((data ?? []) as unknown as JoinedRow[]).filter((r) => monthOf(r) === month);

  const pending = all.filter((r) => r.status === 'draft' || r.status === 'submitted');
  const confirmed = all.filter((r) => r.status === 'confirmed');

  const pendingByUser = new Map<string, { name: string; count: number }>();
  for (const r of pending) {
    const cur = pendingByUser.get(r.user_id) ?? { name: r.users?.name ?? '?', count: 0 };
    cur.count += 1;
    pendingByUser.set(r.user_id, cur);
  }

  const totalsByUser = new Map<string, { name: string; total: number; count: number }>();
  for (const r of confirmed) {
    const cur = totalsByUser.get(r.user_id) ?? {
      name: r.users?.name ?? '?',
      total: 0,
      count: 0,
    };
    cur.total += r.amount_twd ?? 0;
    cur.count += 1;
    totalsByUser.set(r.user_id, cur);
  }

  const blocked = pending.length > 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h1 className="text-2xl font-semibold">月結 · {month}</h1>
        <form className="flex items-center gap-2">
          <label className="text-sm text-neutral-600 dark:text-neutral-400">選擇月份</label>
          <input
            type="month"
            name="month"
            defaultValue={month}
            className="px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm"
          />
          <button
            type="submit"
            className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm"
          >
            切換
          </button>
        </form>
      </div>

      {blocked ? (
        <div className="mb-6 rounded-2xl bg-red-600 text-white px-5 py-4">
          <div className="text-lg font-bold">
            尚有 {pending.length} 筆未處理,無法結算
          </div>
          <ul className="mt-2 text-sm space-y-0.5">
            {Array.from(pendingByUser.values()).map((u) => (
              <li key={u.name}>
                · {u.name}:{u.count} 筆待確認/待審核
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm opacity-90">
            請員工在<Link href="/staff/queue" className="underline">待確認匣</Link>送出,
            或在<Link href="/boss/expenses" className="underline">審核清單</Link>逐筆處理後才可結算。
          </p>
        </div>
      ) : null}

      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-neutral-100 dark:bg-neutral-800 text-left">
            <tr>
              <th className="px-3 py-2">姓名</th>
              <th className="px-3 py-2 text-right">筆數</th>
              <th className="px-3 py-2 text-right">已確認總額</th>
            </tr>
          </thead>
          <tbody>
            {totalsByUser.size === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-8 text-center text-neutral-500">
                  本月尚無已確認的代墊
                </td>
              </tr>
            ) : (
              Array.from(totalsByUser.values()).map((u) => (
                <tr key={u.name} className="border-t border-neutral-200 dark:border-neutral-800">
                  <td className="px-3 py-2 font-medium">{u.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{u.count}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">
                    NT$ {u.total.toLocaleString('zh-TW')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex gap-3 flex-wrap">
        <a
          href={`/api/boss/close/${month}/export.csv`}
          className={`px-4 py-2 rounded-xl text-sm font-medium ${
            blocked || confirmed.length === 0
              ? 'bg-neutral-300 text-neutral-500 cursor-not-allowed pointer-events-none'
              : 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
          }`}
        >
          產出月結 CSV
        </a>
        <LockButton month={month} disabled={blocked || confirmed.length === 0} />
      </div>
    </div>
  );
}
