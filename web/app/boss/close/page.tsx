import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { ExpenseRecord } from '@/lib/types';
import LockButton from './LockButton';
import { taipeiCurrentMonthStr } from '@/lib/tz';

export const dynamic = 'force-dynamic';

function currentMonth(): string {
  return taipeiCurrentMonthStr();
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

  const drafts = all.filter((r) => r.status === 'draft');
  const submitted = all.filter((r) => r.status === 'submitted');
  const pending = [...drafts, ...submitted];
  const confirmed = all.filter((r) => r.status === 'confirmed');

  type BreakdownRow = { name: string; draft: number; submitted: number };
  const pendingByUser = new Map<string, BreakdownRow>();
  for (const r of pending) {
    const cur = pendingByUser.get(r.user_id) ?? { name: r.users?.name ?? '?', draft: 0, submitted: 0 };
    if (r.status === 'draft') cur.draft += 1;
    else if (r.status === 'submitted') cur.submitted += 1;
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
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--nm-text-primary)' }}>薪資結算 · {month}</h1>
        <form className="flex items-center gap-2">
          <label className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>選擇月份</label>
          <input
            type="month"
            name="month"
            defaultValue={month}
            className="nm-input text-[13px]"
            style={{ width: 'auto', minHeight: 36, padding: '6px 12px' }}
          />
          <button
            type="submit"
            className="nm-btn text-[13px]"
            style={{ minHeight: 36, padding: '6px 12px' }}
          >
            切換
          </button>
        </form>
      </div>

      {blocked ? (
        <div
          className="mb-6 rounded-2xl px-5 py-4"
          style={{
            background: 'rgba(224, 122, 122, 0.1)',
            border: '1px solid rgba(224, 122, 122, 0.34)',
            color: 'var(--nm-danger-glass-text)',
          }}
        >
          <div className="text-lg font-bold">
            尚有 {pending.length} 筆未處理,無法完成薪資結算
          </div>
          <ul className="mt-2 text-[13px] space-y-1">
            {Array.from(pendingByUser.values()).map((u) => (
              <li key={u.name}>
                · {u.name}:
                {u.draft > 0 && <span className="ml-1">{u.draft} 筆員工尚未送出</span>}
                {u.draft > 0 && u.submitted > 0 && <span>,</span>}
                {u.submitted > 0 && <span className="ml-1">{u.submitted} 筆待您審核</span>}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[13px] opacity-90 leading-relaxed">
            {drafts.length > 0 && (
              <>
                <strong>員工尚未送出的</strong>:請通知員工在自己手機 App 的「待送出」抽屜完成金額/品項並送出。
                <br />
              </>
            )}
            {submitted.length > 0 && (
              <>
                <strong>待您審核的</strong>:到 <Link href="/boss/expenses" className="underline font-semibold">審核清單</Link> 逐筆確認/退回。
              </>
            )}
          </p>
        </div>
      ) : null}

      <div className="rounded-2xl nm-raised overflow-x-auto overflow-y-auto">
        <table className="w-full text-[13px]" style={{ minWidth: 780, borderCollapse: 'collapse' }}>
          <thead style={{ background: 'rgba(20,20,24,0.92)' }}>
            <tr className="text-left" style={{ color: 'var(--nm-text-muted)' }}>
              <th className="px-3 py-2 font-normal whitespace-nowrap">姓名</th>
              <th className="px-3 py-2 text-right font-normal whitespace-nowrap">筆數</th>
              <th className="px-3 py-2 text-right font-normal whitespace-nowrap">已確認總額</th>
            </tr>
          </thead>
          <tbody>
            {totalsByUser.size === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-8 text-center whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>
                  本月尚無已確認的代墊
                </td>
              </tr>
            ) : (
              Array.from(totalsByUser.values()).map((u) => (
                <tr key={u.name} style={{ borderTop: '1px solid var(--nm-border-hair)' }}>
                  <td className="px-3 py-2 font-medium whitespace-nowrap" style={{ color: 'var(--nm-text-body)' }}>{u.name}</td>
                  <td className="px-3 py-2 text-right tabular whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>{u.count}</td>
                  <td className="px-3 py-2 text-right tabular font-semibold whitespace-nowrap" style={{ color: 'var(--nm-text-body)' }}>
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
          className={
            blocked || confirmed.length === 0
              ? 'nm-btn text-[13px] font-medium pointer-events-none'
              : 'nm-btn-solid text-[13px]'
          }
          style={(blocked || confirmed.length === 0) ? { opacity: 0.5 } : undefined}
        >
          匯出 CSV
        </a>
        <LockButton month={month} disabled={blocked || confirmed.length === 0} />
      </div>
    </div>
  );
}
