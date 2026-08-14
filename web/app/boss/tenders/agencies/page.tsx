import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import ViewportLock from '@/app/_shared/ViewportLock';
import { fetchTenderRadar } from '@/lib/tender-radar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Competition {
  n: number;
  tier: 'none' | 'thin' | 'range' | 'stable';
  soloCount: number;
  soloRate: number | null;
  soloCI: [number, number] | null;
  avgBidders: number | null;
  excludedPerformance?: number;
}

interface Agency {
  unit_id: string;
  name: string | null;
  case_count: number;
  solo_count: number;
  avg_bidders: number;
  first_award_date: string | null;
  last_award_date: string | null;
  performance_count: number;
  competition: Competition;
}

interface LoadResult {
  agencies: Agency[];
  computedAt: string | null;
  error: string | null;
}

async function loadAgencies(minCases: number): Promise<LoadResult> {
  const { data, error } = await fetchTenderRadar<{ agencies: Agency[]; computed_at: string | null }>(
    `/api/market/agencies?min=${minCases}&limit=40`,
  );
  return { agencies: data?.agencies ?? [], computedAt: data?.computed_at ?? null, error };
}

// 距今幾個月。政府採購有年度預算週期,「多久沒發案」比「發過幾案」更能
// 判斷這個機關現在還活不活躍。
function monthsSince(date: string | null): number | null {
  if (!date) return null;
  const then = new Date(`${date}T00:00:00+08:00`).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / (86_400_000 * 30.44));
}

// 獨標率的視覺長度。刻意不做顏色分級(紅=好/綠=壞之類)——區間普遍寬到
// 30-50 個百分點,用顏色斬釘截鐵地分類等於掩蓋不確定性。只給長度,讓
// 數字與區間自己說話。
function bar(rate: number | null): string {
  return rate === null ? '0%' : `${Math.round(rate * 100)}%`;
}

function AgencyRow({ a, rank }: { a: Agency; rank: number }) {
  const c = a.competition;
  const months = monthsSince(a.last_award_date);
  const dormant = months !== null && months >= 12;

  return (
    <li className="rounded-2xl nm-raised p-3">
      <div className="mb-1.5 flex flex-wrap items-baseline gap-2">
        <span className="tabular-nums text-xs" style={{ color: 'var(--nm-text-faint)' }}>{rank}</span>
        <span className="text-[14px] font-semibold" style={{ color: 'var(--nm-text-primary)' }}>
          {a.name || a.unit_id}
        </span>
        <span className="tabular-nums text-xs" style={{ color: 'var(--nm-text-secondary)' }}>
          {a.case_count} 件
        </span>
        {months !== null && (
          <span
            className="ml-auto text-xs tabular-nums"
            style={{ color: dormant ? '#c99a3a' : 'var(--nm-text-faint)' }}
          >
            {months === 0 ? '本月剛發案' : `最近一案 ${months} 個月前`}
          </span>
        )}
      </div>

      <div className="mb-1 flex items-center gap-2">
        <div
          className="h-2 flex-1 overflow-hidden rounded-full"
          style={{ background: 'rgba(156,146,147,0.14)' }}
        >
          <div
            className="h-full rounded-full"
            style={{ width: bar(c.soloRate), background: 'rgba(224,179,80,0.55)' }}
          />
        </div>
        <span className="tabular-nums text-[13px]" style={{ color: 'var(--nm-text-primary)' }}>
          {c.soloRate === null ? '—' : `${Math.round(c.soloRate * 100)}%`}
        </span>
      </div>

      <p className="text-xs" style={{ color: 'var(--nm-text-secondary)' }}>
        {a.solo_count} / {a.case_count} 件只有一家投標
        {c.soloCI && (
          <>
            {' '}(真實值 {Math.round(c.soloCI[0] * 100)}–{Math.round(c.soloCI[1] * 100)}%
            {c.tier === 'range' ? ',樣本少' : ''})
          </>
        )}
        {' · '}平均 {a.avg_bidders.toFixed(1)} 家
        {a.performance_count > 0 && (
          <span style={{ color: 'var(--nm-text-muted)' }}>
            {' · '}另有 {a.performance_count} 件是採購演出,未列入
          </span>
        )}
      </p>
    </li>
  );
}

export default async function BossAgenciesPage({
  searchParams,
}: {
  searchParams: Promise<{ min?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'boss') redirect('/staff');

  const sp = await searchParams;
  const minCases = [3, 5, 10].includes(Number(sp.min)) ? Number(sp.min) : 3;

  const { agencies, computedAt, error } = await loadAgencies(minCases);

  return (
    <ViewportLock>
      <header className="shrink-0 mb-3">
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--nm-text-primary)' }}>機關經營名單</h1>
        <p className="mt-0.5 text-sm" style={{ color: 'var(--nm-text-secondary)' }}>
          近 3 年發過音響類標案的機關,依案量排序
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <a href="/boss/tenders/monitor" className="text-xs underline" style={{ color: 'var(--nm-text-faint)' }}>
            → 標案監測
          </a>
          {computedAt && (
            <span className="text-xs" style={{ color: 'var(--nm-text-faint)' }}>
              統計計算於 {computedAt.slice(0, 10)}
            </span>
          )}
        </div>
      </header>

      <nav className="shrink-0 mb-3 flex gap-1 rounded-2xl nm-inset p-1 text-[13px]">
        {[3, 5, 10].map((m) => (
          <a
            key={m}
            href={`/boss/tenders/agencies?min=${m}`}
            className={m === minCases ? 'nm-btn-solid' : 'nm-btn'}
            style={{ padding: '5px 12px', minHeight: 'auto', fontSize: '12px' }}
          >
            至少 {m} 件
          </a>
        ))}
      </nav>

      <p
        className="shrink-0 mb-3 rounded-xl p-3 text-xs leading-relaxed"
        style={{ background: 'rgba(120,144,156,0.10)', color: 'var(--nm-text-secondary)' }}
      >
        條長是「只有一家投標」的比率,越長代表過去越少人跟你搶。但括號裡的區間才是誠實的範圍——
        多數機關的案量只有個位數,真實值可能差很多,不要只看前面那個百分比。
        少於 3 件的機關不列入,樣本太小算什麼都是巧合。
        得標者是劇團/樂團/馬戲團的案(機關買的是演出而不是音響工程)不列入計算,因為那種案只有該團能接。
      </p>

      {error && (
        <div
          className="shrink-0 rounded-xl p-3 text-[13px]"
          style={{
            background: 'rgba(224, 122, 122, 0.08)',
            border: '1px solid rgba(224, 122, 122, 0.34)',
            color: 'var(--nm-danger-glass-text)',
          }}
        >
          {error}
        </div>
      )}

      {!error && agencies.length === 0 && (
        <p className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>
          沒有符合條件的機關(統計可能尚未計算,排程每日重算一次)
        </p>
      )}

      {agencies.length > 0 && (
        <div className="min-h-0 flex-1">
          <ul className="h-full space-y-2 overflow-y-auto pr-1 pb-6">
            {agencies.map((a, i) => (
              <AgencyRow key={a.unit_id} a={a} rank={i + 1} />
            ))}
          </ul>
        </div>
      )}
    </ViewportLock>
  );
}
