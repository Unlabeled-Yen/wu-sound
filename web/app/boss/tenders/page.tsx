import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type FieldStatus = 'value' | 'withheld' | 'unfetched' | 'fetch_failed';

interface TenderHit {
  id: string;
  job_number: string;
  title: string;
  unit_id: string | null;
  unit_name: string | null;
  category: string | null;
  notice_type: string;
  publish_date: string;
  deadline_date: string | null;
  deadline_status: FieldStatus;
  budget: number | null;
  budget_status: FieldStatus;
  source_url: string;
  is_retender: number;
}

interface LoadResult {
  hits: TenderHit[];
  error: string | null;
}

async function loadRecentTenders(days: number): Promise<LoadResult> {
  const base = process.env.TENDER_RADAR_API_URL;
  const token = process.env.TENDER_RADAR_API_TOKEN;
  if (!base || !token) {
    return { hits: [], error: '標案雷達連線尚未設定(缺 TENDER_RADAR_API_URL/TOKEN)' };
  }

  try {
    const res = await fetch(`${base}/api/tenders/recent?days=${days}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) {
      return { hits: [], error: `標案雷達回應異常:HTTP ${res.status}` };
    }
    const json = (await res.json()) as { hits: TenderHit[] };
    return { hits: json.hits, error: null };
  } catch (err) {
    return { hits: [], error: `連線標案雷達失敗:${err instanceof Error ? err.message : String(err)}` };
  }
}

function formatBudget(hit: TenderHit): string {
  switch (hit.budget_status) {
    case 'value': {
      if (hit.budget === null) return '資料異常';
      const yuan = hit.budget / 100;
      if (yuan >= 10000) return `$${(yuan / 10000).toLocaleString('zh-TW')} 萬`;
      return `$${yuan.toLocaleString('zh-TW')}`;
    }
    case 'withheld':
      return '預算不公開';
    case 'unfetched':
      return '預算未查詢';
    case 'fetch_failed':
      return '⚠️ 預算查詢失敗';
  }
}

function formatDeadline(hit: TenderHit): string {
  switch (hit.deadline_status) {
    case 'value':
      return hit.deadline_date ? `截止 ${hit.deadline_date}` : '截止日資料異常';
    case 'withheld':
      return '截止日不公開';
    case 'unfetched':
      return '截止日未查詢';
    case 'fetch_failed':
      return '⚠️ 截止日查詢失敗';
  }
}

function TenderCard({ hit }: { hit: TenderHit }) {
  const hasLink = hit.source_url.length > 0;
  return (
    <li className="rounded-2xl nm-raised p-4">
      <div className="mb-1 flex flex-wrap items-baseline gap-2 text-[13px]">
        <span className="font-semibold" style={{ color: 'var(--nm-text-primary)' }}>
          {hit.unit_name || hit.unit_id || '未知機關'}
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-xs"
          style={{ background: 'rgba(156,146,147,0.14)', color: 'var(--nm-text-secondary)' }}
        >
          {hit.notice_type}
        </span>
        {hit.is_retender === 1 && (
          <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: 'rgba(224,179,80,0.14)', color: '#c99a3a' }}>
            ⚠️ 流標重招
          </span>
        )}
        <span className="ml-auto text-xs" style={{ color: 'var(--nm-text-faint)' }}>
          公告 {hit.publish_date}
        </span>
      </div>
      <p className="mb-2 text-[13px]" style={{ color: 'var(--nm-text-body)' }}>{hit.title}</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>
        <span className="tabular-nums">{formatBudget(hit)}</span>
        <span>{formatDeadline(hit)}</span>
      </div>
      <div className="mt-2 text-xs">
        {hasLink ? (
          <a href={hit.source_url} target="_blank" rel="noreferrer" style={{ color: 'var(--nm-text-secondary)' }} className="underline">
            查看標案詳情 →
          </a>
        ) : (
          <span style={{ color: 'var(--nm-text-muted)' }}>
            ⚠️ 詳情連結未取得,請至政府採購網搜尋案號 {hit.job_number}
          </span>
        )}
      </div>
    </li>
  );
}

export default async function BossTendersPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'boss') redirect('/staff');

  const sp = await searchParams;
  const days = [1, 3, 7, 14, 30].includes(Number(sp.days)) ? Number(sp.days) : 7;

  const { hits, error } = await loadRecentTenders(days);

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--nm-text-primary)' }}>標案監測</h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--nm-text-secondary)' }}>
            近 {days} 天命中 {hits.length} 件
          </p>
        </div>
        <nav className="flex gap-1 rounded-2xl nm-inset p-1 text-[13px]">
          {[1, 3, 7, 14, 30].map((d) => (
            <a
              key={d}
              href={`/boss/tenders?days=${d}`}
              className={d === days ? 'nm-btn-solid' : 'nm-btn'}
              style={{ padding: '6px 14px', minHeight: 'auto' }}
            >
              {d} 天
            </a>
          ))}
        </nav>
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
          {error}
        </div>
      )}

      {hits.length === 0 && !error && (
        <p className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>近 {days} 天沒有命中的標案</p>
      )}

      {hits.length > 0 && (
        <ul className="space-y-3">
          {hits.map((hit) => (
            <TenderCard key={hit.id} hit={hit} />
          ))}
        </ul>
      )}
    </div>
  );
}
