import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ClockinRow {
  id: string;
  user_id: string;
  ts: string;
  type: 'in' | 'out';
  is_backfill: boolean;
  backfill_reason: string | null;
  users: { name: string } | null;
}

function parseMonth(v: string | undefined): { ym: string; y: number; m: number } {
  const now = new Date();
  const fallback = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const ym = v && /^\d{4}-\d{2}$/.test(v) ? v : fallback;
  const [y, m] = ym.split('-').map((x) => parseInt(x, 10));
  return { ym, y, m };
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function localDay(iso: string) {
  return new Date(iso).getDate();
}

export default async function BossClockinsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'boss') redirect('/');

  const sp = await searchParams;
  const { ym, y, m } = parseMonth(sp.month);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  const daysInMonth = new Date(y, m, 0).getDate();

  const supabase = getSupabaseAdmin();
  const [{ data: usersData, error: usersErr }, { data: clockData, error: ciErr }] = await Promise.all([
    supabase.from('users').select('id, name, role, active').eq('role', 'staff').order('name'),
    supabase
      .from('clockins')
      .select('id, user_id, ts, type, is_backfill, backfill_reason, users(name)')
      .gte('ts', start.toISOString())
      .lt('ts', end.toISOString())
      .order('ts', { ascending: true }),
  ]);

  const error = usersErr?.message || ciErr?.message || null;
  const users = (usersData || []) as { id: string; name: string }[];
  const rows = (clockData || []) as unknown as ClockinRow[];

  // group: user_id -> day -> entries
  const byUser = new Map<string, Map<number, ClockinRow[]>>();
  for (const r of rows) {
    if (!byUser.has(r.user_id)) byUser.set(r.user_id, new Map());
    const day = localDay(r.ts);
    const m2 = byUser.get(r.user_id)!;
    if (!m2.has(day)) m2.set(day, []);
    m2.get(day)!.push(r);
  }

  // prev/next month
  function shift(delta: number) {
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  const prev = shift(-1);
  const next = shift(1);

  return (
    <div className="min-h-screen bg-neutral-50 p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">打卡月表</h1>
          <p className="text-sm text-neutral-500">{ym}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/boss/clockins?month=${prev}`}
            className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm"
          >
            ← 上個月
          </Link>
          <Link
            href={`/boss/clockins?month=${next}`}
            className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm"
          >
            下個月 →
          </Link>
          <a
            href={`/api/boss/clockins/export.csv?month=${ym}`}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white"
          >
            匯出 CSV
          </a>
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          讀取失敗:{error}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white shadow-sm">
        <table className="min-w-full border-collapse text-xs">
          <thead className="bg-neutral-100">
            <tr>
              <th className="sticky left-0 z-10 min-w-[6rem] border-b border-neutral-200 bg-neutral-100 p-2 text-left">
                姓名
              </th>
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
                <th key={d} className="border-b border-l border-neutral-200 p-1 text-center min-w-[3.5rem]">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td colSpan={daysInMonth + 1} className="p-4 text-center text-neutral-500">
                  尚無員工
                </td>
              </tr>
            )}
            {users.map((u) => {
              const days = byUser.get(u.id) || new Map<number, ClockinRow[]>();
              return (
                <tr key={u.id} className="align-top">
                  <td className="sticky left-0 z-10 border-b border-neutral-200 bg-white p-2 font-medium">
                    {u.name}
                  </td>
                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                    const entries = days.get(d) || [];
                    return (
                      <td key={d} className="border-b border-l border-neutral-200 p-1 text-center">
                        {entries.length === 0 ? (
                          <span className="text-neutral-300">·</span>
                        ) : (
                          <div className="space-y-0.5">
                            {entries.map((e) => (
                              <div key={e.id} className="flex items-center justify-center gap-1">
                                <span
                                  className={
                                    e.type === 'in' ? 'text-emerald-700' : 'text-orange-700'
                                  }
                                  title={e.type === 'in' ? '上班' : '下班'}
                                >
                                  {e.type === 'in' ? '入' : '出'} {fmtTime(e.ts)}
                                </span>
                                {e.is_backfill && (
                                  <span
                                    className="rounded bg-orange-100 px-1 text-[10px] text-orange-800"
                                    title={e.backfill_reason || '補登'}
                                  >
                                    補
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
