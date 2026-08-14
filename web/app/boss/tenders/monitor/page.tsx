import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import ViewportLock from '@/app/_shared/ViewportLock';

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

// 機關競爭雷達。tier 是樣本量分級:none=無紀錄、thin=1-2 案(不給比率)、
// range=3-9 案、stable=≥10 案。soloRate 有值時 soloCI 必定有值——後端保證,
// 前端也絕不單獨顯示比率(區間動輒 30-50 個百分點寬,只給一個數字會誤導)。
interface AgencyCompetition {
  n: number;
  tier: 'none' | 'thin' | 'range' | 'stable';
  soloCount: number;
  soloRate: number | null;
  soloCI: [number, number] | null;
  avgBidders: number | null;
  excludedPerformance?: number;
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
  agency_competition?: AgencyCompetition | null;
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

// 機關競爭雷達的文案。三條鐵律:
// 1. 有比率就一定連區間一起講——區間動輒 30-50 個百分點寬,單獨給一個
//    百分比會讓 Wu 以為那是確定的。
// 2. 1-2 案只講原始件數,不算比率(對 2 案講「50%」是假精確)。
// 3. 沒有歷史就明講沒有,不留白——留白會被讀成「沒有競爭」。
function agencyRadarText(a: AgencyCompetition): { text: string; hint: string } {
  // 採購演出的案(得標者是表演團體)不算競爭強度,但要講出來——這種案
  // 只有那個團能接,獨標是天經地義,混進來會讓機關看起來「很好打」。
  const perf = a.excludedPerformance ?? 0;
  const perfNote = perf > 0 ? `;另有 ${perf} 件是採購演出,不列入計算` : '';

  if (a.tier === 'none') {
    return {
      text: perf > 0
        ? `近 3 年此機關 ${perf} 件音響案全是採購演出(請表演團體),無可競爭的工程案`
        : '近 3 年查無此機關的音響案紀錄,無從判斷競爭',
      hint: perf > 0
        ? '得標者是劇團/樂團/馬戲團這類表演團體,代表機關買的是演出而不是音響工程,Wu 接不到這種案'
        : '這不代表沒有競爭,只代表資料庫裡沒有這個機關的音響類決標歷史',
    };
  }
  if (a.tier === 'thin') {
    const all = a.soloCount === a.n;
    // n=1 用「皆」不通順,單數講「該案」
    const which = all ? (a.n === 1 ? '該案' : '皆') : `其中 ${a.soloCount} 件`;
    return {
      text: `近 3 年僅 ${a.n} 件可競爭的音響案,${which}只有一家投標(樣本太少,不算比率)${perfNote}`,
      hint: '少於 3 件不計算百分比——樣本這麼小時,任何比率都只是巧合。採購演出的案(得標者是表演團體)已排除,那種案只有該團能接,不算競爭',
    };
  }
  const pct = Math.round((a.soloRate ?? 0) * 100);
  const [lo, hi] = a.soloCI ?? [0, 1];
  const thin = a.tier === 'range' ? ',樣本少' : '';
  return {
    text: `近 3 年 ${a.n} 件可競爭的音響案 · ${a.soloCount} 件只有一家投標(${pct}%,真實值 ${Math.round(lo * 100)}–${Math.round(hi * 100)}%${thin})${perfNote}`,
    hint: `平均每案 ${a.avgBidders?.toFixed(1)} 家投標。「真實值」是 95% 信賴區間——樣本越少區間越寬,不能只看前面那個百分比`,
  };
}

interface ViewParams {
  days: number;
  price: string;
  nature: string;
  pool: string;
}

function buildHref(params: ViewParams): string {
  const q = new URLSearchParams({ days: String(params.days) });
  if (params.price !== 'all') q.set('price', params.price);
  if (params.nature !== 'all') q.set('nature', params.nature);
  if (params.pool !== 'all') q.set('pool', params.pool);
  return `/boss/tenders/monitor?${q.toString()}`;
}

// 流標重招池:第一次沒決標成功、重新招標的案。單獨看是因為它的決策情境
// 跟新案不一樣——不是跟一群人搶新機會,而是在看一件別人已經放掉一次的事。
// 說明文字兩面都講:採購法 48 條第 2 項讓第二次招標可以不受三家限制、
// 等標期也得縮短,所以競爭確實通常較少;但沒人接也可能是預算不合理或
// 條件太苛,那是風險不是機會。系統不替 Wu 判斷是哪一種。
const RETENDER_NOTE =
  '這些案第一次沒決標成功。採購法允許第二次招標不受三家廠商限制、等標期也可縮短,所以競爭通常較少;' +
  '但上次沒人接也可能是預算不合理或條件太苛。值得看,但要先弄清楚為什麼上次沒成。';

function isRetender(h: TenderHit): boolean {
  return h.is_retender === 1 || (h.signals ?? []).some((s) => s.code === 'retender_round');
}

// 分佈矩陣:價格帶 × 案件性質。每個數字都是連結——格子套兩軸,邊際的
// 合計套單軸,右下角總計清空篩選。
//
// 兩個刻意的設計決定:
// 1. 矩陣的行列取自「全部命中案」而非當前篩選結果,所以結構固定不變形。
//    地圖不該在你走動時改變形狀,否則篩完就找不到路回去。
// 2. 每格的數字就是點下去會看到的件數(兩軸都套用),不會出現「顯示 5 件、
//    點進去 0 件」。邊際合計同理。
function DistributionMatrix({
  allHits,
  poolHits,
  days,
  price,
  nature,
  pool,
}: {
  /** 決定矩陣有哪些行列——固定用全部命中案,結構才不會隨篩選變形 */
  allHits: TenderHit[];
  /** 決定每格數字——已套用池子篩選,格子數字才等於點下去看到的件數 */
  poolHits: TenderHit[];
  days: number;
  price: string;
  nature: string;
  pool: string;
}) {
  const rows = PRICE_ORDER.filter((k) => allHits.some((h) => h.price_band?.key === k));
  const cols = NATURE_ORDER.filter((k) => allHits.some((h) => h.nature?.key === k));
  if (rows.length === 0 || cols.length === 0) return null;

  const priceLabel = (k: string) => allHits.find((h) => h.price_band?.key === k)?.price_band?.label ?? k;
  const natureLabel = (k: string) => allHits.find((h) => h.nature?.key === k)?.nature?.label ?? k;

  const count = (p: string, n: string) =>
    poolHits.filter(
      (h) => (p === 'all' || h.price_band?.key === p) && (n === 'all' || h.nature?.key === n),
    ).length;

  const max = Math.max(...rows.flatMap((r) => cols.map((c) => count(r, c))), 1);

  const Cell = ({ p, n, bold }: { p: string; n: string; bold?: boolean }) => {
    const c = count(p, n);
    const active = price === p && nature === n;
    if (c === 0) {
      return (
        <td className="p-0.5 text-center">
          <span className="text-xs" style={{ color: 'var(--nm-text-muted)', opacity: 0.4 }}>–</span>
        </td>
      );
    }
    return (
      <td className="p-0.5 text-center">
        <a
          href={buildHref({ days, price: p, nature: n, pool })}
          className="block rounded-lg tabular-nums"
          style={{
            padding: '5px 2px',
            fontSize: '12px',
            fontWeight: bold || active ? 600 : 400,
            color: active ? 'var(--nm-text-primary)' : 'var(--nm-text-secondary)',
            background: active
              ? 'rgba(224,179,80,0.22)'
              : `rgba(156,146,147,${(0.05 + (c / max) * 0.16).toFixed(3)})`,
          }}
        >
          {c}
        </a>
      </td>
    );
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full" style={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: 360 }}>
        <thead>
          <tr>
            <th />
            {cols.map((c) => (
              <th key={c} className="p-0.5 text-center text-xs font-normal" style={{ color: 'var(--nm-text-faint)' }}>
                {natureLabel(c)}
              </th>
            ))}
            <th className="p-0.5 text-center text-xs font-normal" style={{ color: 'var(--nm-text-faint)' }}>合計</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r}>
              <th
                className="whitespace-nowrap pr-2 text-right text-xs font-normal"
                style={{ color: 'var(--nm-text-faint)' }}
              >
                {priceLabel(r)}
              </th>
              {cols.map((c) => (
                <Cell key={c} p={r} n={c} />
              ))}
              <Cell p={r} n="all" bold />
            </tr>
          ))}
          <tr>
            <th className="pr-2 text-right text-xs font-normal" style={{ color: 'var(--nm-text-faint)' }}>合計</th>
            {cols.map((c) => (
              <Cell key={c} p="all" n={c} bold />
            ))}
            <Cell p="all" n="all" bold />
          </tr>
        </tbody>
      </table>
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

      {hit.agency_competition && (() => {
        const r = agencyRadarText(hit.agency_competition!);
        const known = hit.agency_competition!.tier !== 'none';
        return (
          <p
            className="mt-2 text-xs"
            style={{ color: known ? 'var(--nm-text-secondary)' : 'var(--nm-text-muted)' }}
            title={r.hint}
          >
            {r.text}
          </p>
        );
      })()}

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
  searchParams: Promise<{ days?: string; price?: string; nature?: string; pool?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'boss') redirect('/staff');

  const sp = await searchParams;
  const days = [1, 3, 7, 14, 30].includes(Number(sp.days)) ? Number(sp.days) : 7;
  const price = PRICE_ORDER.includes(sp.price as (typeof PRICE_ORDER)[number]) ? sp.price! : 'all';
  const nature = NATURE_ORDER.includes(sp.nature as (typeof NATURE_ORDER)[number]) ? sp.nature! : 'all';
  const pool = sp.pool === 'retender' ? 'retender' : 'all';

  const { hits, error } = await loadRecentTenders(days);

  // 分類是 API 現算的,但舊版 Worker 尚未部署時欄位會是 undefined——
  // 那時不要假裝有分類,直接把篩選列藏起來,免得顯示「每類都 0 件」誤導。
  const hasClassification = hits.length > 0 && hits.every((h) => h.price_band && h.nature);

  const retenderCount = hits.filter(isRetender).length;
  const poolHits = pool === 'retender' ? hits.filter(isRetender) : hits;

  const visible = poolHits.filter(
    (h) =>
      (price === 'all' || h.price_band?.key === price) &&
      (nature === 'all' || h.nature?.key === nature),
  );

  const isFiltered = price !== 'all' || nature !== 'all' || pool !== 'all';

  const filterPanel = hasClassification ? (
    <div className="rounded-2xl nm-inset p-3">
      {retenderCount > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {[
            { key: 'all', label: '全部', n: hits.length },
            { key: 'retender', label: '流標重招', n: retenderCount },
          ].map((o) => (
            <a
              key={o.key}
              href={buildHref({ days, price, nature, pool: o.key })}
              className={pool === o.key ? 'nm-btn-solid' : 'nm-btn'}
              style={{ padding: '4px 12px', minHeight: 'auto', fontSize: '12px' }}
            >
              {o.label}
              <span className="ml-1 tabular-nums" style={{ opacity: 0.62 }}>{o.n}</span>
            </a>
          ))}
        </div>
      )}

      <DistributionMatrix
        allHits={hits}
        poolHits={poolHits}
        days={days}
        price={price}
        nature={nature}
        pool={pool}
      />

      {isFiltered && (
        <p className="mt-2 text-center text-xs">
          <a href={buildHref({ days, price: 'all', nature: 'all', pool: 'all' })} className="underline" style={{ color: 'var(--nm-text-faint)' }}>
            清除篩選
          </a>
        </p>
      )}
    </div>
  ) : null;

  return (
    <ViewportLock>
      <header className="shrink-0 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--nm-text-primary)' }}>標案監測</h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--nm-text-secondary)' }}>
            近 {days} 天命中 {hits.length} 件
            {isFiltered && ` · 篩選後 ${visible.length} 件`}
          </p>
          <div className="mt-1 flex flex-wrap gap-3 text-xs">
            <a href="/boss/tenders/agencies" className="underline" style={{ color: 'var(--nm-text-faint)' }}>
              → 機關經營名單
            </a>
            <a href="/boss/tenders" className="underline" style={{ color: 'var(--nm-text-faint)' }}>
              → 資料進度板
            </a>
          </div>
        </div>
        <nav className="flex gap-1 rounded-2xl nm-inset p-1 text-[13px]">
          {[1, 3, 7, 14, 30].map((d) => (
            <a
              key={d}
              href={buildHref({ days: d, price, nature, pool })}
              className={d === days ? 'nm-btn-solid' : 'nm-btn'}
              style={{ padding: '6px 14px', minHeight: 'auto' }}
            >
              {d} 天
            </a>
          ))}
        </nav>
      </header>

      {/* 桌機:分佈矩陣固定在上方(地圖不該跟著捲走);手機螢幕不夠高,
          矩陣跟著清單一起捲,不然清單只剩不到一張卡的高度 */}
      <div className="hidden lg:block shrink-0">{filterPanel}</div>

      {pool === 'retender' && (
        <p
          className="shrink-0 rounded-xl p-3 text-xs leading-relaxed"
          style={{ background: 'rgba(224,179,80,0.08)', color: 'var(--nm-text-secondary)' }}
        >
          {RETENDER_NOTE}
        </p>
      )}

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

      {hits.length === 0 && !error && (
        <p className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>近 {days} 天沒有命中的標案</p>
      )}

      {hits.length > 0 && visible.length === 0 && (
        <p className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>
          此分類組合沒有案件,
          <a href={buildHref({ days, price: 'all', nature: 'all', pool })} className="underline">回到全部</a>
        </p>
      )}

      {/* 卡片清單是唯一會捲動的區域——標題、篩選、分佈矩陣固定在上面,
          頁面總高度不隨命中件數改變。底部漸層是「下面還有」的訊號。 */}
      {visible.length > 0 && (
        <div className="relative min-h-0 flex-1">
          <div className="h-full space-y-3 overflow-y-auto pr-1 pb-6">
            {/* 手機版的分佈矩陣在捲動區裡面(桌機版在上面固定那份) */}
            <div className="lg:hidden">{filterPanel}</div>
            <ul className="space-y-3">
              {visible.map((hit) => (
                <TenderCard key={hit.id} hit={hit} />
              ))}
            </ul>
          </div>
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-8"
            style={{ background: 'linear-gradient(to top, var(--nm-bg-deep), transparent)' }}
            aria-hidden
          />
        </div>
      )}
    </ViewportLock>
  );
}
