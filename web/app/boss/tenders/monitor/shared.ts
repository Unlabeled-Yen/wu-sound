// 標案監測頁共用型別與純函式。抽出來給 page.tsx、SignalRow、TrackedList 共用,
// 避免同一份 TenderHit 型別跟 daysLeft() 邏輯在多個檔案各自長出一份、日後改一邊漏一邊。

export type FieldStatus = 'value' | 'withheld' | 'unfetched' | 'fetch_failed';

export interface TenderSignal {
  code: string;
  label: string;
}

export interface PriceBand {
  key: string;
  label: string;
}

export interface Nature {
  key: string;
  label: string;
  matched: string | null;
}

// 機關競爭雷達。tier 是樣本量分級:none=無紀錄、thin=1-2 案(不給比率)、
// range=3-9 案、stable=≥10 案。soloRate 有值時 soloCI 必定有值——後端保證,
// 前端也絕不單獨顯示比率(區間動輒 30-50 個百分點寬,只給一個數字會誤導)。
export interface AgencyCompetition {
  n: number;
  tier: 'none' | 'thin' | 'range' | 'stable';
  soloCount: number;
  soloRate: number | null;
  soloCI: [number, number] | null;
  avgBidders: number | null;
  excludedPerformance?: number;
}

// A 計劃(歷史決標參考)卡片。docs/handoff-base-price-card.md §2c。
// tier 對齊機關雷達同一套小樣本誠實邏輯:none=無資料、raw=1-2筆(列原始
// 比值不算統計量)、range_median=3-9筆(範圍+中位數)、quartile=≥10筆
// (加四分位數)。
export interface RatioStats {
  n: number;
  tier: 'none' | 'raw' | 'range_median' | 'quartile';
  ratios?: number[];
  min?: number;
  max?: number;
  median?: number;
  q1?: number;
  q3?: number;
}

export interface GroupedStats {
  best_value: RatioStats;
  lowest_bid: RatioStats;
  other: RatioStats;
  totalN: number;
}

// group_labels 是分類名稱的顯示文字,由 API 送——wu-sound 是公開 repo,
// 不能把這幾個分類名稱寫死在前端原始碼裡(見 handoff §1a)。
export interface BasePriceCardData {
  domain: 'audio' | 'fire' | 'hvac' | 'it';
  headline: string;
  confidence: 'insufficient' | 'low' | 'medium' | 'high';
  source: 'agency' | 'county' | 'market';
  source_label: string;
  stats: GroupedStats;
  group_labels: Record<'best_value' | 'lowest_bid' | 'other', string>;
  excludedPerformance: number;
}

export type BasePriceField = BasePriceCardData | { domain: 'other' };

export interface TenderHit {
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
  base_price?: BasePriceField | null;
}

// 顯示順序寫死在前端,不靠 API 回傳順序——分類的呈現次序是版面決策,
// 從小到大 / 從具體到模糊,缺漏的桶要能穩定出現在同一個位置。
export const PRICE_ORDER = ['micro', 'small', 'medium', 'large', 'undisclosed', 'unknown'] as const;
export const NATURE_ORDER = ['install', 'procure', 'maintain', 'event', 'service', 'unclassified'] as const;

// 截止日剩餘天數。等標期中位數只有 6.5-7 天,「還剩幾天」比日期本身
// 更能驅動行動,所以獨立算一個欄位放在卡片上。
export function daysLeft(hit: TenderHit): number | null {
  if (hit.deadline_status !== 'value' || !hit.deadline_date) return null;
  const deadline = new Date(`${hit.deadline_date}T23:59:59+08:00`);
  const diff = deadline.getTime() - Date.now();
  return Math.ceil(diff / 86_400_000);
}

// 開標視窗雷達(07-視覺校正指南 §3.4-4)座標換算。指南寫明「座標必須由資料算,
// 不要照抄原型的 left:%」——這兩個函式就是那個「由資料算」,TenderRadar.tsx
// 只負責畫,不重算。

export const RADAR_X_DOMAIN_DAYS = 30; // x = (截止日-今天)/30,超過 30 天釘在右緣
export const RADAR_Y_TICKS_TWD = [1_000_000, 3_000_000, 6_000_000, 12_000_000] as const;

/** 距離截止日天數 -> 0~1(0=今天/最急,1=30天以後/最不急)。負值(已過期)釘 0。 */
export function daysToXPct(days: number): number {
  return Math.max(0, Math.min(1, days / RADAR_X_DOMAIN_DAYS));
}

/** 預算(元)取對數,映射到 1M~12M 的 0~1(0=1M 或以下,1=12M 或以上)。 */
export function budgetToYPct(budgetTwd: number): number {
  const min = RADAR_Y_TICKS_TWD[0];
  const max = RADAR_Y_TICKS_TWD[RADAR_Y_TICKS_TWD.length - 1];
  if (budgetTwd <= min) return 0;
  if (budgetTwd >= max) return 1;
  return (Math.log(budgetTwd) - Math.log(min)) / (Math.log(max) - Math.log(min));
}

// 倒數格式 `2d 03h`(訊號列/追蹤清單用,比卡片上的「還剩 N 天」更精細一格)。
// 跟 daysLeft() 分開算,不互相依賴——deadline_status 不是 value 時兩邊都回 null,
// 呼叫端各自決定怎麼顯示缺值,不要在這裡混一套規則進兩種呈現。
export function formatCountdown(hit: TenderHit): string | null {
  if (hit.deadline_status !== 'value' || !hit.deadline_date) return null;
  const deadline = new Date(`${hit.deadline_date}T23:59:59+08:00`);
  const diffMs = deadline.getTime() - Date.now();
  if (diffMs < 0) return '已截止';
  const totalHours = Math.floor(diffMs / 3_600_000);
  const d = Math.floor(totalHours / 24);
  const h = totalHours % 24;
  return `${d}d ${String(h).padStart(2, '0')}h`;
}

// 「今天」用台北時區(+08:00),跟 daysLeft() 的時區處理一致——伺服器
// 執行環境時區不保證是台北,不能直接用 new Date().toISOString().slice(0,10)。
export function todayInTaipei(): string {
  // Date.getTime() 是 UTC epoch ms,跟伺服器本地時區無關,直接加 8 小時換算台北時間即可。
  const taipei = new Date(Date.now() + 8 * 60 * 60_000);
  return taipei.toISOString().slice(0, 10);
}

export function isRetender(h: TenderHit): boolean {
  return h.is_retender === 1 || (h.signals ?? []).some((s) => s.code === 'retender_round');
}

export interface ViewParams {
  days: number;
  price: string;
  nature: string;
  pool: string;
  /** 訊號列格 1「七日內截止」的過濾器,純前端邏輯,不對應任何後端欄位。省略等同 false。 */
  urgent?: boolean;
  /** 訊號列格 2「今日新進」的過濾器,純前端邏輯,不對應任何後端欄位。省略等同 false。 */
  fresh?: boolean;
}

export function buildHref(params: ViewParams): string {
  const q = new URLSearchParams({ days: String(params.days) });
  if (params.price !== 'all') q.set('price', params.price);
  if (params.nature !== 'all') q.set('nature', params.nature);
  if (params.pool !== 'all') q.set('pool', params.pool);
  if (params.urgent) q.set('urgent', '1');
  if (params.fresh) q.set('fresh', '1');
  return `/boss/tenders/monitor?${q.toString()}`;
}
