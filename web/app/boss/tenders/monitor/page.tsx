import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type FieldStatus = 'value' | 'withheld' | 'unfetched' | 'fetch_failed';

interface TenderSignal {
  code: string;
  label: string;
}

interface PriceBand {
  key: string;
  label: string;
}

interface Nature {
  key: string;
  label: string;
  matched: string | null;
}

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
  signals?: TenderSignal[];
  price_band?: PriceBand;
  nature?: Nature;
}

interface LoadResult {
  hits: TenderHit[];
  error: string | null;
}

// 顯示順序寫死在前端,不靠 API 回傳順序——分類的呈現次序是版面決策,
// 從小到大 / 從具體到模糊,缺漏的桶要能穩定出現在同一個位置。
const PRICE_ORDER = ['micro', 'small', 'medium', 'large', 'undisclosed', 'unknown'] as const;
const NATURE_ORDER = ['install', 'procure', 'maintain', 'event', 'service', 'unclassified'] as const;

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

// 截止日剩餘天數。等標期中位數只有 6.5-7 天,「還剩幾天」比日期本身
// 更能驅動行動,所以獨立算一個欄位放在卡片上。
function daysLeft(hit: TenderHit): number | null {
  if (hit.deadline_status !== 'value' || !hit.deadline_date) return null;
  const deadline = new Date(`${hit.deadline_date}T23:59:59+08:00`);
  const diff = deadline.getTime() - Date.now();
  return Math.ceil(diff / 86_400_000);
}

function buildHref(params: { days: number; price: string; nature: string }): string {
  const q = new URLSearchParams({ days: String(params.days) });
  if (params.price !== 'all') q.set('price', params.price);
  if (params.nature !== 'all') q.set('nature', params.nature);
  return `/boss/tenders/monitor?${q.toString()}`;
}

function FilterRow({
  title,
  paramName,
  options,
  active,
  days,
  price,
  nature,
}: {
  title: string;
  paramName: 'price' | 'nature';
  options: Array<{ key: string; label: string; count: number }>;
  active: string;
  days: number;
  price: string;
  nature: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 w-12 shrink-0 text-xs" style={{ color: 'var(--nm-text-faint)' }}>
        {title}
      </span>
      {options.map((o) => {
        const next = paramName === 'price' ? { days, price: o.key, nature } : { days, price, nature: o.key };
        const isActive = active === o.key;
        return (
          <a
            key={o.key}
            href={buildHref(next)}
            className={isActive ? 'nm-btn-solid' : 'nm-btn'}
            style={{ padding: '4px 10px', minHeight: 'auto', fontSize: '12px' }}
          >
            {o.label}
            <span className="ml-1 tabular-nums" style={{ opacity: 0.62 }}>
              {o.count}
            </span>
          </a>
        );
      })}
    </div>
  );
}

function TenderCard({ hit }: { hit: TenderHit }) {
  const hasLink = hit.source_url.length > 0;
  const signals = hit.signals ?? [];
  // is_retender 是「歷史上出現過無法決標公告」的粗判斷;signals 裡的
  // retender_round 是從招標公告本身的「招標狀態」欄位算出的精確輪次——
  // 兩個訊號重疊時只顯示精確的那個,不要同一件事講兩次
  const hasRetenderSignal = signals.some((s) => s.code === 'retender_round');
  const left = daysLeft(hit);
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
        {hit.is_retender === 1 && !hasRetenderSignal && (
          <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: 'rgba(224,179,80,0.14)', color: '#c99a3a' }}>
            ⚠️ 流標重招
          </span>
        )}
        {signals.map((s) => (
          <span
            key={s.code}
            className="rounded-full px-2 py-0.5 text-xs"
            style={{ background: 'rgba(224,179,80,0.14)', color: '#c99a3a' }}
          >
            {s.label}
          </span>
        ))}
        <span className="ml-auto text-xs" style={{ color: 'var(--nm-text-faint)' }}>
          公告 {hit.publish_date}
        </span>
      </div>

      <p className="mb-2 text-[13px]" style={{ color: 'var(--nm-text-body)' }}>{hit.title}</p>

      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {hit.nature && (
          <span
            className="rounded-full px-2 py-0.5 text-xs"
            style={{ background: 'rgba(120,144,156,0.16)', color: 'var(--nm-text-secondary)' }}
            title={hit.nature.matched ? `命中關鍵字:${hit.nature.matched}` : '標題沒有可辨識的性質關鍵字'}
          >
            {hit.nature.label}
          </span>
        )}
        {hit.price_band && (
          <span
            className="rounded-full px-2 py-0.5 text-xs"
            style={{ background: 'rgba(120,144,156,0.16)', color: 'var(--nm-text-secondary)' }}
          >
            {hit.price_band.label}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>
        <span className="tabular-nums">{formatBudget(hit)}</span>
        <span>{formatDeadline(hit)}</span>
        {left !== null && (
          <span className="tabular-nums" style={{ color: left <= 3 ? '#c99a3a' : 'var(--nm-text-secondary)' }}>
            {left < 0 ? '已截止' : left === 0 ? '今天截止' : `還剩 ${left} 天`}
          </span>
        )}
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

export default async function BossTendersMonitorPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; price?: string; nature?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'boss') redirect('/staff');

  const sp = await searchParams;
  const days = [1, 3, 7, 14, 30].includes(Number(sp.days)) ? Number(sp.days) : 7;
  const price = PRICE_ORDER.includes(sp.price as (typeof PRICE_ORDER)[number]) ? sp.price! : 'all';
  const nature = NATURE_ORDER.includes(sp.nature as (typeof NATURE_ORDER)[number]) ? sp.nature! : 'all';

  const { hits, error } = await loadRecentTenders(days);

  // 分類是 API 現算的,但舊版 Worker 尚未部署時欄位會是 undefined——
  // 那時不要假裝有分類,直接把篩選列藏起來,免得顯示「每類都 0 件」誤導。
  const hasClassification = hits.length > 0 && hits.every((h) => h.price_band && h.nature);

  // 計數一律以「另一軸已套用的篩選」為基準,這樣點下去的數字就是點完
  // 會看到的件數,不會出現「顯示 5 件、點進去 0 件」。
  const byNatureFiltered = nature === 'all' ? hits : hits.filter((h) => h.nature?.key === nature);
  const byPriceFiltered = price === 'all' ? hits : hits.filter((h) => h.price_band?.key === price);

  const priceOptions = [
    { key: 'all', label: '全部', count: byNatureFiltered.length },
    ...PRICE_ORDER.map((k) => ({
      key: k,
      label: byNatureFiltered.find((h) => h.price_band?.key === k)?.price_band?.label ?? k,
      count: byNatureFiltered.filter((h) => h.price_band?.key === k).length,
    })).filter((o) => o.count > 0),
  ];

  const natureOptions = [
    { key: 'all', label: '全部', count: byPriceFiltered.length },
    ...NATURE_ORDER.map((k) => ({
      key: k,
      label: byPriceFiltered.find((h) => h.nature?.key === k)?.nature?.label ?? k,
      count: byPriceFiltered.filter((h) => h.nature?.key === k).length,
    })).filter((o) => o.count > 0),
  ];

  const visible = hits.filter(
    (h) =>
      (price === 'all' || h.price_band?.key === price) &&
      (nature === 'all' || h.nature?.key === nature),
  );

  const isFiltered = price !== 'all' || nature !== 'all';

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--nm-text-primary)' }}>標案監測</h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--nm-text-secondary)' }}>
            近 {days} 天命中 {hits.length} 件
            {isFiltered && ` · 篩選後 ${visible.length} 件`}
          </p>
          <a href="/boss/tenders" className="mt-1 inline-block text-xs underline" style={{ color: 'var(--nm-text-faint)' }}>
            → 資料進度板
          </a>
        </div>
        <nav className="flex gap-1 rounded-2xl nm-inset p-1 text-[13px]">
          {[1, 3, 7, 14, 30].map((d) => (
            <a
              key={d}
              href={buildHref({ days: d, price, nature })}
              className={d === days ? 'nm-btn-solid' : 'nm-btn'}
              style={{ padding: '6px 14px', minHeight: 'auto' }}
            >
              {d} 天
            </a>
          ))}
        </nav>
      </header>

      {hasClassification && (
        <div className="mb-4 flex flex-col gap-2 rounded-2xl nm-inset p-3">
          <FilterRow
            title="價格"
            paramName="price"
            options={priceOptions}
            active={price}
            days={days}
            price={price}
            nature={nature}
          />
          <FilterRow
            title="性質"
            paramName="nature"
            options={natureOptions}
            active={nature}
            days={days}
            price={price}
            nature={nature}
          />
        </div>
      )}

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

      {hits.length > 0 && visible.length === 0 && (
        <p className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>
          此分類組合沒有案件,
          <a href={buildHref({ days, price: 'all', nature: 'all' })} className="underline">回到全部</a>
        </p>
      )}

      {visible.length > 0 && (
        <ul className="space-y-3">
          {visible.map((hit) => (
            <TenderCard key={hit.id} hit={hit} />
          ))}
        </ul>
      )}
    </div>
  );
}
