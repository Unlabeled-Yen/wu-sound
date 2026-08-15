import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { fetchTenderRadar } from '@/lib/tender-radar';
import {
  PRICE_ORDER,
  NATURE_ORDER,
  daysLeft,
  isRetender,
  todayInTaipei,
  buildHref,
  type TenderHit,
  type AgencyCompetition,
  type BasePriceField,
} from './shared';
import SignalRow from './SignalRow';
import TrackedList from './TrackedList';
import RivalDossier from './RivalDossier';
import TenderRadar from './TenderRadar';
import IntelLog from './IntelLog';
import { PriceBand } from './PriceBands';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface LoadResult {
  hits: TenderHit[];
  error: string | null;
}

async function loadRecentTenders(days: number): Promise<LoadResult> {
  const { data, error } = await fetchTenderRadar<{ hits: TenderHit[] }>(`/api/tenders/recent?days=${days}`);
  return { hits: data?.hits ?? [], error };
}

interface SyncStatusResponse {
  latest: { run_date: string; status: string; finished_at: string | null } | null;
  last_success: { run_date: string; finished_at: string | null } | null;
}

interface SyncStatus {
  failed: boolean;
  lastSuccessLabel: string | null;
}

// 時間一律 14:07／昨 18:40 的絕對格式(見 07-視覺校正指南 §3.4 情資日誌同一條規則),
// 同步這裡沒有精確到分鐘以上的必要就用「今日 14:07」/「MM-DD 14:07」,不用「3 小時前」。
function formatSyncTime(iso: string): string {
  const d = new Date(iso);
  const taipei = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  const today = todayInTaipei();
  const y = taipei.getFullYear();
  const m = String(taipei.getMonth() + 1).padStart(2, '0');
  const day = String(taipei.getDate()).padStart(2, '0');
  const hh = String(taipei.getHours()).padStart(2, '0');
  const mm = String(taipei.getMinutes()).padStart(2, '0');
  const dateKey = `${y}-${m}-${day}`;
  return `${dateKey === today ? '今日' : `${m}-${day}`} ${hh}:${mm}`;
}

async function loadSyncStatus(): Promise<SyncStatus | null> {
  const { data } = await fetchTenderRadar<SyncStatusResponse>('/api/status');
  if (!data || !data.latest) return null;
  const failed = data.latest.status === 'failed';
  const successRun = failed ? data.last_success : data.latest;
  return {
    failed,
    lastSuccessLabel: successRun?.finished_at ? formatSyncTime(successRun.finished_at) : null,
  };
}

// 越線警報件數(07-視覺校正指南 §3.4 訊號列第 4 格)。近 7 天決標中,
// award/base < 0.86 的件數。null 代表 API 沒回應,不代表 0——SignalRow
// 會分別呈現「查詢失敗」跟「0 件」,不能混為一談。
async function loadBreachCount(): Promise<number | null> {
  const { data } = await fetchTenderRadar<{ breaches: unknown[] }>('/api/signals/breaches?days=7&threshold=0.86');
  return data ? data.breaches.length : null;
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

// 歷史決標參考卡片(A 計劃前端,docs/handoff-base-price-card.md §3)。
// 三種異常態各自處理,不能混用同一種顯示(§1d):
//   undefined → 舊版 Worker 沒有這欄位,整塊不渲染(跟 hasClassification
//     判斷同一邏輯,但這裡是逐案判斷)
//   null      → 查詢失敗,紅字「歷史參考載入失敗」
//   {domain:'other'} → 不適用(非四領域案件),整塊不顯示,不是錯誤
// 用原生 <details>/<summary> 做行內展開,不需要 client component、不跳轉。
function BasePriceCard({ bp }: { bp: BasePriceField | null | undefined }) {
  if (bp === undefined) return null;
  if (bp === null) {
    return (
      <p className="mt-2 text-[12px] leading-[1.6]" style={{ color: 'var(--nm-danger-glass-text)' }}>
        ⚠️ 歷史參考載入失敗
      </p>
    );
  }
  if (bp.domain === 'other') return null;

  // source='agency' 是本機關自己的數據,一般底色;county/market 是借來的
  // 退階基線,警示底色+⚠️前綴——老闆掃過去一眼要能分辨兩者(§1c)。
  const isFallback = bp.source !== 'agency';
  const dim = bp.confidence === 'insufficient' || bp.confidence === 'low';

  return (
    <details className="mt-2">
      <summary
        className="cursor-pointer list-none text-[12px] leading-[1.6]"
        style={{ color: dim ? 'var(--nm-text-muted)' : 'var(--nm-text-secondary)' }}
      >
        {isFallback && (
          <span
            className="mr-1 rounded-full px-1.5 py-0.5"
            style={{ background: 'rgba(217,181,107,0.14)', color: 'var(--nm-warning-glass-text)' }}
          >
            ⚠️ {bp.source_label}
          </span>
        )}
        {bp.headline}
        {bp.excludedPerformance > 0 && (
          <span style={{ color: 'var(--nm-text-muted)' }}>;另有 {bp.excludedPerformance} 件是採購演出,不列入計算</span>
        )}
        <span className="ml-1" style={{ color: 'var(--nm-text-faint)' }}>▾</span>
      </summary>
      <div className="mt-1.5 space-y-1 rounded-lg p-2" style={{ background: 'rgba(255,255,255,0.05)' }}>
        <PriceBand label={bp.group_labels.best_value} stats={bp.stats.best_value} />
        <PriceBand label={bp.group_labels.lowest_bid} stats={bp.stats.lowest_bid} />
        <PriceBand label={bp.group_labels.other} stats={bp.stats.other} />
      </div>
    </details>
  );
}


// 流標重招池:第一次沒決標成功、重新招標的案。單獨看是因為它的決策情境
// 跟新案不一樣——不是跟一群人搶新機會,而是在看一件別人已經放掉一次的事。
// 說明文字兩面都講:採購法 48 條第 2 項讓第二次招標可以不受三家限制、
// 等標期也得縮短,所以競爭確實通常較少;但沒人接也可能是預算不合理或
// 條件太苛,那是風險不是機會。系統不替 Wu 判斷是哪一種。
const RETENDER_NOTE =
  '這些案第一次沒決標成功。採購法允許第二次招標不受三家廠商限制、等標期也可縮短,所以競爭通常較少;' +
  '但上次沒人接也可能是預算不合理或條件太苛。值得看,但要先弄清楚為什麼上次沒成。';

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
              ? 'rgba(217,181,107,0.22)'
              : `rgba(255,255,255,${(0.02 + (c / max) * 0.07).toFixed(3)})`,
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
              <th key={c} className="p-0.5 text-center text-[11px] leading-none tracking-[.14em] font-normal" style={{ color: 'var(--nm-text-faint)' }}>
                {natureLabel(c)}
              </th>
            ))}
            <th className="p-0.5 text-center text-[11px] leading-none tracking-[.14em] font-normal" style={{ color: 'var(--nm-text-faint)' }}>合計</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r}>
              <th
                className="whitespace-nowrap pr-2 text-right text-[11px] leading-none tracking-[.14em] font-normal"
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
            <th className="pr-2 text-right text-[11px] leading-none tracking-[.14em] font-normal" style={{ color: 'var(--nm-text-faint)' }}>合計</th>
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
    <li id={`tender-${hit.id}`} className="rounded-2xl nm-raised p-4 scroll-mt-4">
      <div className="mb-1 flex flex-wrap items-baseline gap-2 text-[13px]">
        <span className="font-semibold" style={{ color: 'var(--nm-text-primary)' }}>
          {hit.unit_name || hit.unit_id || '未知機關'}
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-[11px] leading-none tracking-[.14em]"
          style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--nm-text-secondary)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          {hit.notice_type}
        </span>
        {hit.is_retender === 1 && !hasRetenderSignal && (
          <span className="rounded-full px-2 py-0.5 text-[11px] leading-none tracking-[.14em]" style={{ background: 'rgba(217,181,107,0.14)', color: 'var(--nm-warning-glass-text)' }}>
            ⚠️ 流標重招
          </span>
        )}
        {signals.map((s) => (
          <span
            key={s.code}
            className="rounded-full px-2 py-0.5 text-[11px] leading-none tracking-[.14em]"
            style={{ background: 'rgba(217,181,107,0.14)', color: 'var(--nm-warning-glass-text)' }}
          >
            {s.label}
          </span>
        ))}
        <span className="ml-auto text-[11px] leading-none tracking-[.14em]" style={{ color: 'var(--nm-text-faint)' }}>
          公告 {hit.publish_date}
        </span>
      </div>

      <p className="mb-2 text-[13px]" style={{ color: 'var(--nm-text-body)' }}>
        {hit.title}
        {hit.notice_type.includes('更正') && (
          <span
            className="ml-1.5 text-[10px] px-1 py-px rounded align-middle"
            style={{ color: 'var(--nm-warning-glass-text)', background: 'rgba(217,181,107,0.12)', border: '1px solid rgba(217,181,107,0.26)' }}
          >
            有更正公告
          </span>
        )}
      </p>

      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {hit.nature && (
          <span
            className="rounded-full px-2 py-0.5 text-[11px] leading-none tracking-[.14em]"
            style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--nm-text-secondary)' }}
            title={hit.nature.matched ? `命中關鍵字:${hit.nature.matched}` : '標題沒有可辨識的性質關鍵字'}
          >
            {hit.nature.label}
          </span>
        )}
        {hit.price_band && (
          <span
            className="rounded-full px-2 py-0.5 text-[11px] leading-none tracking-[.14em]"
            style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--nm-text-secondary)' }}
          >
            {hit.price_band.label}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>
        <span className="tabular-nums">{formatBudget(hit)}</span>
        <span>{formatDeadline(hit)}</span>
        {left !== null && (
          <span className="tabular-nums" style={{ color: left <= 3 ? 'var(--nm-warning-glass-text)' : 'var(--nm-text-secondary)' }}>
            {left < 0 ? '已截止' : left === 0 ? '今天截止' : `還剩 ${left} 天`}
          </span>
        )}
      </div>

      {hit.agency_competition && (() => {
        const r = agencyRadarText(hit.agency_competition!);
        const known = hit.agency_competition!.tier !== 'none';
        return (
          <p
            className="mt-2 text-[12px] leading-[1.6]"
            style={{ color: known ? 'var(--nm-text-secondary)' : 'var(--nm-text-muted)' }}
            title={r.hint}
          >
            {r.text}
          </p>
        );
      })()}

      <BasePriceCard bp={hit.base_price} />

      <div className="mt-2 text-[12px] leading-[1.6]">
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
  searchParams: Promise<{ days?: string; price?: string; nature?: string; pool?: string; urgent?: string; fresh?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'boss') redirect('/staff');

  const sp = await searchParams;
  const days = [1, 3, 7, 14, 30].includes(Number(sp.days)) ? Number(sp.days) : 7;
  const price = PRICE_ORDER.includes(sp.price as (typeof PRICE_ORDER)[number]) ? sp.price! : 'all';
  const nature = NATURE_ORDER.includes(sp.nature as (typeof NATURE_ORDER)[number]) ? sp.nature! : 'all';
  const pool = sp.pool === 'retender' ? 'retender' : 'all';
  const urgent = sp.urgent === '1';
  const fresh = sp.fresh === '1';

  const [{ hits, error }, syncStatus, breachCount] = await Promise.all([
    loadRecentTenders(days),
    loadSyncStatus(),
    loadBreachCount(),
  ]);

  // 分類是 API 現算的,但舊版 Worker 尚未部署時欄位會是 undefined——
  // 那時不要假裝有分類,直接把篩選列藏起來,免得顯示「每類都 0 件」誤導。
  const hasClassification = hits.length > 0 && hits.every((h) => h.price_band && h.nature);

  const retenderCount = hits.filter(isRetender).length;
  const poolHits = pool === 'retender' ? hits.filter(isRetender) : hits;

  const visible = poolHits.filter(
    (h) =>
      (price === 'all' || h.price_band?.key === price) &&
      (nature === 'all' || h.nature?.key === nature) &&
      (!urgent || (() => { const d = daysLeft(h); return d !== null && d >= 0 && d <= 7; })()) &&
      (!fresh || h.publish_date === todayInTaipei()),
  );

  const isFiltered = price !== 'all' || nature !== 'all' || pool !== 'all' || urgent || fresh;

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
        <p className="mt-2 text-center text-[12px] leading-[1.6]">
          <a href={buildHref({ days, price: 'all', nature: 'all', pool: 'all' })} className="underline" style={{ color: 'var(--nm-text-faint)' }}>
            清除篩選
          </a>
        </p>
      )}
    </div>
  ) : null;

  return (
    <div className="flex flex-col gap-3">
      <header className="shrink-0 flex flex-wrap items-center justify-between gap-3 pb-3" style={{ borderBottom: '1px solid var(--nm-border-hair)' }}>
        <div>
          <div className="flex items-center gap-2 text-[11px] leading-none uppercase" style={{ color: 'var(--nm-text-muted)', letterSpacing: '.18em' }}>
            <span>標案</span>
            <span
              className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 normal-case tracking-normal"
              style={{ background: 'rgba(224,48,19,0.12)', border: '1px solid rgba(224,48,19,0.34)', color: 'var(--nm-breach)' }}
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: 'var(--nm-breach)', boxShadow: '0 0 8px var(--nm-breach)' }}
              />
              LIVE
            </span>
          </div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--nm-text-primary)' }}>標案監測</h1>
          <p className="mt-0.5 text-[13px] leading-[1.6] tabular-nums" style={{ color: 'var(--nm-text-secondary)' }}>
            近 {days} 天命中 {hits.length} 件
            {isFiltered && ` · 篩選後 ${visible.length} 件`}
          </p>
          <div className="mt-1 flex flex-wrap gap-3 text-[12px] leading-[1.6]">
            <a href="/boss/tenders/agencies" className="underline" style={{ color: 'var(--nm-text-faint)' }}>
              → 機關經營名單
            </a>
            <a href="/boss/tenders" className="underline" style={{ color: 'var(--nm-text-faint)' }}>
              → 資料進度板
            </a>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="text-right text-[12px] leading-[1.6] tabular-nums" style={{ color: 'var(--nm-text-faint)' }}>
            <div>來源 政府採購網</div>
            {syncStatus === null ? (
              <div>同步狀態未知</div>
            ) : syncStatus.failed ? (
              <div style={{ color: 'var(--nm-danger)' }}>
                同步失敗{syncStatus.lastSuccessLabel ? `　上次成功 ${syncStatus.lastSuccessLabel}` : ''}
              </div>
            ) : (
              <div>同步 {syncStatus.lastSuccessLabel ?? '—'}</div>
            )}
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
        </div>
      </header>

      <div className="shrink-0">
        <SignalRow hits={hits} days={days} price={price} nature={nature} pool={pool} urgent={urgent} fresh={fresh} breachCount={breachCount} />
      </div>

      {/* 桌機兩欄:左=雷達/分佈矩陣/追蹤清單/卡片(主分析流),右=對手檔案/
          情資日誌(側欄式情報流),對照設計 mock。手機螢幕擺不下兩欄,全部
          倒回單欄跟著整頁捲。 */}
      <div className="hidden lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)] lg:gap-3">
        <div className="space-y-3 min-w-0">
          <TenderRadar hits={visible} />
          {filterPanel}
          {pool === 'retender' && (
            <p
              className="rounded-xl p-3 text-[12px] leading-[1.6]"
              style={{ background: 'rgba(217,181,107,0.08)', color: 'var(--nm-text-secondary)' }}
            >
              {RETENDER_NOTE}
            </p>
          )}
          {error && (
            <div
              className="rounded-xl p-3 text-[13px]"
              style={{
                background: 'rgba(224, 122, 122, 0.08)',
                border: '1px solid rgba(224, 122, 122, 0.34)',
                color: 'var(--nm-danger-glass-text)',
              }}
            >
              {error}
            </div>
          )}
          {visible.length > 0 && (
            <>
              <TrackedList hits={visible} />
              <ul className="space-y-3">
                {visible.map((hit) => (
                  <TenderCard key={hit.id} hit={hit} />
                ))}
              </ul>
            </>
          )}
        </div>
        <div className="space-y-3 min-w-0">
          <RivalDossier />
          <IntelLog hits={visible} />
        </div>
      </div>

      {hits.length === 0 && !error && (
        <p className="hidden lg:block text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>
          近 {days} 天沒有命中的標案
        </p>
      )}
      {hits.length > 0 && visible.length === 0 && (
        <p className="hidden lg:block text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>
          此分類組合沒有案件,
          <a href={buildHref({ days, price: 'all', nature: 'all', pool })} className="underline">回到全部</a>
        </p>
      )}

      {/* 手機版:全部單欄按順序流,不做兩欄——手機螢幕擺不下,且整頁自然
          捲動,不需要固定區塊。 */}
      <div className="lg:hidden space-y-3">
        {filterPanel}
        <TenderRadar hits={visible} />
        <RivalDossier />
        <IntelLog hits={visible} />
        {pool === 'retender' && (
          <p
            className="rounded-xl p-3 text-[12px] leading-[1.6]"
            style={{ background: 'rgba(217,181,107,0.08)', color: 'var(--nm-text-secondary)' }}
          >
            {RETENDER_NOTE}
          </p>
        )}
        {error && (
          <div
            className="rounded-xl p-3 text-[13px]"
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
        {visible.length > 0 && (
          <>
            <TrackedList hits={visible} />
            <ul className="space-y-3">
              {visible.map((hit) => (
                <TenderCard key={hit.id} hit={hit} />
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
