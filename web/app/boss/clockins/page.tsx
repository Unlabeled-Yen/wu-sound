import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';
import { pairClockinsByDay } from '@/lib/hours';
import AllocationEditor from './AllocationEditor';
import ClockinEntry from './ClockinEntry';

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
  const [
    { data: usersData, error: usersErr },
    { data: clockData, error: ciErr },
    { data: sitesData },
    { data: allocData },
  ] = await Promise.all([
    supabase.from('users').select('id, name, role, active').eq('role', 'staff').order('name'),
    supabase
      .from('clockins')
      .select('id, user_id, ts, type, is_backfill, backfill_reason, users(name)')
      .gte('ts', start.toISOString())
      .lt('ts', end.toISOString())
      .order('ts', { ascending: true }),
    supabase.from('sites').select('id, name').eq('active', true).order('name'),
    supabase
      .from('day_site_allocations')
      .select('user_id, worked_on, site_id')
      .gte('worked_on', `${ym}-01`)
      .lt('worked_on', end.toISOString().slice(0, 10)),
  ]);

  const error = usersErr?.message || ciErr?.message || null;
  const users = (usersData || []) as { id: string; name: string }[];
  const rows = (clockData || []) as unknown as ClockinRow[];
  const activeSites = (sitesData || []) as { id: string; name: string }[];

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

  // 每人每日工時(供案場歸屬編輯器顯示;口徑見 lib/hours.ts,尚未經老闆正式拍板)
  const userName = new Map(users.map((u) => [u.id, u.name]));
  const allocationRows: Array<{ user_id: string; user_name: string; worked_on: string; hours: number | null }> = [];
  for (const [userId, dayMap] of byUser) {
    const clockinsForUser = Array.from(dayMap.values()).flat().map((c) => ({ ts: c.ts, type: c.type }));
    const days = pairClockinsByDay(clockinsForUser);
    for (const d of days) {
      allocationRows.push({
        user_id: userId,
        user_name: userName.get(userId) ?? '?',
        worked_on: d.dateKey,
        hours: d.pairs.length > 0 ? d.totalHours : null,
      });
    }
  }
  allocationRows.sort((a, b) => a.worked_on.localeCompare(b.worked_on) || a.user_name.localeCompare(b.user_name));

  const initialAllocations: Record<string, string[]> = {};
  for (const a of (allocData || []) as Array<{ user_id: string; worked_on: string; site_id: string }>) {
    const key = `${a.user_id}:${a.worked_on}`;
    (initialAllocations[key] ??= []).push(a.site_id);
  }

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--nm-text-primary)' }}>打卡月表</h1>
          <p className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>{ym}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/boss/clockins?month=${prev}`}
            className="nm-btn text-[13px]"
            style={{ padding: '6px 14px', minHeight: 'auto' }}
          >
            ← 上個月
          </Link>
          <Link
            href={`/boss/clockins?month=${next}`}
            className="nm-btn text-[13px]"
            style={{ padding: '6px 14px', minHeight: 'auto' }}
          >
            下個月 →
          </Link>
          <a
            href={`/api/boss/clockins/export.csv?month=${ym}`}
            className="nm-btn-solid text-[13px]"
          >
            匯出 CSV
          </a>
        </div>
      </header>

      {error && (
        <div
          className="mb-4 rounded-xl p-3 text-[13px]"
          style={{
            background: 'rgba(224, 122, 122, 0.08)',
            border: '1px solid rgba(224, 122, 122, 0.34)',
            color: 'var(--nm-danger-glass-text)',
          }}
        >
          讀取失敗:{error}
        </div>
      )}

      <div className="rounded-2xl nm-raised overflow-x-auto overflow-y-auto">
        <table className="border-collapse text-xs" style={{ minWidth: 900 }}>
          <thead style={{ background: 'rgba(20,20,24,0.92)' }}>
            <tr>
              <th
                className="sticky left-0 z-10 min-w-[6rem] p-2 text-left whitespace-nowrap"
                style={{ background: 'rgba(20,20,24,0.96)', color: 'var(--nm-text-muted)', borderBottom: '1px solid var(--nm-border-hair)' }}
              >
                姓名
              </th>
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
                <th
                  key={d}
                  className="p-1 text-center min-w-[3.5rem] whitespace-nowrap"
                  style={{ color: 'var(--nm-text-muted)', borderBottom: '1px solid var(--nm-border-hair)', borderLeft: '1px solid var(--nm-border-hair)' }}
                >
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td colSpan={daysInMonth + 1} className="p-4 text-center whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>
                  尚無員工
                </td>
              </tr>
            )}
            {users.map((u) => {
              const days = byUser.get(u.id) || new Map<number, ClockinRow[]>();
              return (
                <tr key={u.id} className="align-top">
                  <td
                    className="sticky left-0 z-10 p-2 font-medium whitespace-nowrap"
                    style={{ background: 'rgba(24,24,28,0.9)', color: 'var(--nm-text-body)', borderBottom: '1px solid var(--nm-border-hair)' }}
                  >
                    {u.name}
                  </td>
                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                    const entries = days.get(d) || [];
                    return (
                      <td
                        key={d}
                        className="p-1 text-center whitespace-nowrap"
                        style={{ borderBottom: '1px solid var(--nm-border-hair)', borderLeft: '1px solid var(--nm-border-hair)' }}
                      >
                        {entries.length === 0 ? (
                          <span style={{ color: 'var(--nm-text-faint)' }}>·</span>
                        ) : (
                          <div className="space-y-0.5">
                            {entries.map((e) => (
                              <ClockinEntry
                                key={e.id}
                                id={e.id}
                                type={e.type}
                                ts={e.ts}
                                isBackfill={e.is_backfill}
                                backfillReason={e.backfill_reason}
                              />
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

      <div className="mt-8">
        <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--nm-text-primary)' }}>案場歸屬</h2>
        <p className="text-[13px] mb-3" style={{ color: 'var(--nm-text-secondary)' }}>
          工時口徑為每對上下班配對相加(暫定,未經正式拍板)。這裡記的案場歸屬目前只作紀錄用,
          尚未接進任何報表的損益計算——專案管理系統的協作紀錄與工時分攤正在重新設計,
          等新機制上線後才會有真正的損益依據。
        </p>
        <AllocationEditor sites={activeSites} rows={allocationRows} initial={initialAllocations} />
      </div>
    </div>
  );
}
