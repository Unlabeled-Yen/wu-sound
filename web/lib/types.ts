export type UserRole = 'boss' | 'staff';
export type ExpenseStatus = 'draft' | 'submitted' | 'confirmed' | 'rejected' | 'booked';
export type ExpenseCategory = 'fuel' | 'parking' | 'materials' | 'other';
export type ExpenseSource = 'app' | 'line';
export type ClockinType = 'in' | 'out';

export interface SessionUser {
  id: string;
  name: string;
  role: UserRole;
}

export interface ExpenseAiDraft {
  spent_on?: string;
  amount_twd?: number;
  category?: ExpenseCategory;
  item_text?: string;
  confidence?: 'high' | 'low';
  raw?: string;
}

export interface ExpenseRecord {
  id: string;
  user_id: string;
  captured_at: string;
  spent_on: string | null;
  category: ExpenseCategory | null;
  amount_twd: number | null;
  item_text: string | null;
  site_id: string | null;
  receipt_url: string | null;
  ai_draft: ExpenseAiDraft | null;
  source: ExpenseSource;
  status: ExpenseStatus;
  rejected_reason: string | null;
  booked_batch_id: string | null;
  updated_at: string;
}

export const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  fuel: '油錢',
  parking: '停車過路',
  materials: '設備材料代墊',
  other: '其他',
};

// Phase 2: 大型設備位置追蹤
export type EquipmentCategory =
  | 'speaker'
  | 'subwoofer'
  | 'amplifier'
  | 'mixer'
  | 'mic_wired'
  | 'mic_wireless'
  | 'di_box'
  | 'light'
  | 'light_console'
  | 'stage'
  | 'projector'
  | 'rack'
  | 'other';

export type EquipmentStatus = 'in_storage' | 'on_site' | 'in_repair' | 'retired';

export interface EquipmentRecord {
  id: string;
  name: string;
  brand: string | null;
  model_number: string | null;
  category: EquipmentCategory;
  serial_number: string | null;
  quantity: number;
  unit: string;
  status: EquipmentStatus;
  current_site_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const EQUIPMENT_CATEGORY_LABEL: Record<EquipmentCategory, string> = {
  speaker: '喇叭',
  subwoofer: '超低音',
  amplifier: '擴大機',
  mixer: '混音台',
  mic_wired: '有線麥克風',
  mic_wireless: '無線麥克風',
  di_box: 'DI Box',
  light: '燈具',
  light_console: '燈控台',
  stage: '舞台結構',
  projector: '投影機',
  rack: '機櫃',
  other: '其他',
};

export const EQUIPMENT_STATUS_LABEL: Record<EquipmentStatus, string> = {
  in_storage: '庫房',
  on_site: '專案中',
  in_repair: '維修中',
  retired: '淘汰',
};

export function formatEquipmentLocation(status: EquipmentStatus, site_name?: string | null): string {
  if (status === 'on_site') return site_name ? `專案中 · ${site_name}` : '專案中';
  return EQUIPMENT_STATUS_LABEL[status];
}

// Phase 4: 內帳
export type LedgerDirection = 'income' | 'expense';
export type LedgerKind =
  | 'project' | 'loan' | 'other_income'
  | 'salary' | 'bonus' | 'reimbursement' | 'goods' | 'vehicle'
  | 'rent' | 'utility' | 'credit_card' | 'tax' | 'investment' | 'health' | 'other_expense';
export type InvoiceStatus = 'none' | 'to_issue' | 'issued';
// DB enum ledger_status 只有 active/voided 兩態(見 migrations/013 的教訓註記,
// 'draft' 這個值從未真正加進 DB)——型別曾經含 'draft',會讓型別檢查過但
// runtime 對 DB 下不存在的 enum 值直接 500,已拿掉。
export type LedgerStatus = 'active' | 'voided';

// 帳務 v3:帳簿/狀態機/付款方式/案子分攤。見 docs/ledger-v3-spec-v1.md、migrations/014。
// state 取代 status 作為權威狀態欄位;status 過渡期並存,C3 才移除(不在本輪動)。
export type LedgerJournal = 'customer' | 'vendor' | 'pettycash' | 'payroll' | 'personal';
export type LedgerPaymentMethod = 'transfer' | 'cash' | 'credit_card' | 'check';
export type LedgerState = 'draft' | 'posted' | 'voided';

export const LEDGER_JOURNAL_LABEL: Record<LedgerJournal, string> = {
  customer: '客戶',
  vendor: '廠商',
  pettycash: '零用金',
  payroll: '薪資',
  personal: '老闆個人',
};

export const LEDGER_PAYMENT_METHOD_LABEL: Record<LedgerPaymentMethod, string> = {
  transfer: '轉帳',
  cash: '現金',
  credit_card: '信用卡',
  check: '支票',
};

// 案子分攤:{ site_id: 百分比 },Σ必須 = 100。單案時為 { "<id>": 100 }。
export type SiteDistribution = Record<string, number>;

export interface LedgerEntry {
  id: string;
  occurred_on: string;
  direction: LedgerDirection;
  kind: LedgerKind;
  amount_twd: number;
  fee_twd: number;
  party: string | null;
  memo: string | null;
  is_external: boolean;
  invoice_status: InvoiceStatus;
  invoice_no: string | null;
  invoice_date: string | null;
  tax_amount_twd: number;
  status: LedgerStatus;
  voided_reason: string | null;
  state: LedgerState;
  to_check: boolean;
  journal: LedgerJournal;
  payment_method: LedgerPaymentMethod | null;
  site_distribution: SiteDistribution | null;
  site_id: string | null;
  receivable_id: string | null;
  recurring_template_id: string | null;
  source_batch_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// kind → 預設帳簿。用於批 1 遷移對照與新分錄的預設值;老闆仍可在表單覆蓋。
export const KIND_TO_JOURNAL: Partial<Record<LedgerKind, LedgerJournal>> = {
  project: 'customer',
  other_income: 'customer',
  goods: 'vendor',
  vehicle: 'vendor',
  rent: 'vendor',
  utility: 'vendor',
  tax: 'vendor',
  other_expense: 'vendor',
  reimbursement: 'pettycash',
  salary: 'payroll',
  bonus: 'payroll',
  loan: 'personal',
  investment: 'personal',
  health: 'personal',
};

// 反向索引:帳簿 → 該帳簿底下可選的 kind。表單「先選帳簿」時用來過濾類別選單。
export const JOURNAL_KINDS: Record<LedgerJournal, LedgerKind[]> = (() => {
  const map: Record<LedgerJournal, LedgerKind[]> = { customer: [], vendor: [], pettycash: [], payroll: [], personal: [] };
  for (const [kind, journal] of Object.entries(KIND_TO_JOURNAL) as [LedgerKind, LedgerJournal][]) {
    map[journal].push(kind);
  }
  return map;
})();

export const JOURNAL_ORDER: LedgerJournal[] = ['customer', 'vendor', 'pettycash', 'payroll', 'personal'];

// 帳務 v2:案件類別、應收應付、每日案場歸屬
export interface SiteCategory {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
}

export interface SiteRecord {
  id: string;
  name: string;
  active: boolean;
  category_id: string | null;
  customer_name: string | null;
  created_at: string;
}

export type ReceivableDirection = 'receivable' | 'payable';
export type ReceivableStatus = 'open' | 'closed' | 'voided';

export interface Receivable {
  id: string;
  direction: ReceivableDirection;
  party: string;
  site_id: string | null;
  total_amount_twd: number;
  memo: string | null;
  status: ReceivableStatus;
  /** 約定收款日(應收)/到期日(應付)。可為 null——2026-08 前建立的約定與任何未填的
   *  新約定都是 null,代表「沒有約定明確日期」,不可當成「今天到期」處理。 */
  agreed_due_date: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export const RECEIVABLE_DIRECTION_LABEL: Record<ReceivableDirection, string> = {
  receivable: '應收',
  payable: '應付',
};

export interface RecurringTemplate {
  id: string;
  name: string;
  direction: LedgerDirection;
  kind: LedgerKind;
  amount_twd: number;
  fee_twd: number;
  party: string | null;
  is_external: boolean;
  site_id: string | null;
  day_of_month: number;
  active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface DaySiteAllocation {
  id: string;
  user_id: string;
  worked_on: string;
  site_id: string;
  hours: number | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface UserPayProfile {
  id: string;
  user_id: string;
  monthly_salary_twd: number;
  effective_from: string;
  created_by: string;
  created_at: string;
}

export const LEDGER_KIND_LABEL: Record<LedgerKind, string> = {
  project: '案件收款',
  loan: '借款/資本',
  other_income: '其他收入',
  salary: '薪資',
  bonus: '獎金',
  reimbursement: '代墊/零用金',
  goods: '貨款/採購',
  vehicle: '車輛',
  rent: '租金',
  utility: '水電',
  credit_card: '信用卡',
  tax: '稅金',
  investment: '投資',
  health: '健檢',
  other_expense: '其他支出',
};

export const INCOME_KINDS: LedgerKind[] = ['project', 'loan', 'other_income'];
// credit_card 自 v3 起退役(付款方式與業務性質是兩個維度,見 spec 診斷)——
// 舊資料仍可能存在該值(遷移前),故不從 LedgerKind 型別移除,只從新增表單的可選清單拿掉。
export const EXPENSE_KINDS: LedgerKind[] = [
  'salary', 'bonus', 'reimbursement', 'goods', 'vehicle',
  'rent', 'utility', 'tax', 'investment', 'health', 'other_expense',
];

// kind 與方向是一對一的(INCOME_KINDS/EXPENSE_KINDS 不重疊),所以表單不用讓老闆選
// 方向——選了帳簿、選了類別,方向就跟著定了。這條規則值得測試釘住(ledger-journal-map.test.ts),
// 所以搬到這裡跟資料一起放,而不是埋在某個表單元件裡。
export function directionOfKind(kind: LedgerKind): LedgerDirection {
  return (INCOME_KINDS as LedgerKind[]).includes(kind) ? 'income' : 'expense';
}

export function journalOfKind(kind: LedgerKind, fallback: LedgerJournal): LedgerJournal {
  for (const j of JOURNAL_ORDER) {
    if (JOURNAL_KINDS[j].includes(kind)) return j;
  }
  return fallback;
}

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  none: '不列外帳',
  to_issue: '待開立',
  issued: '已開立',
};

// 5% 營業稅:含稅金額 / 21 = 稅額
export function suggestTax(amountTwd: number): number {
  if (!Number.isFinite(amountTwd) || amountTwd <= 0) return 0;
  return Math.round(amountTwd / 21);
}

// Phase 3: 品項庫 + 報價單
export type QuoteStatus = 'draft' | 'sent' | 'won' | 'lost';
export type QuoteLineSection = '器材' | '安裝';
export type AmpPowerMode = 'rms' | 'burst';
export interface CatalogItem { id:string; brand:string|null; name:string; item_type:string|null; unit:string; cost_price_twd:number|null; sell_price_twd:number|null; category:string|null; note:string|null; active:boolean; created_at:string; updated_at:string; max_spl_db?:number|null; spl_ref_distance_m?:number|null; sensitivity_db_1w1m?:number|null; amp_power_w?:number|null; speaker_impedance_ohm?:number|null; amp_power_mode?:AmpPowerMode|null; coverage_h_deg?:number|null; coverage_v_deg?:number|null; }
export interface Quote { id:string; client_name:string; project_name:string|null; status:QuoteStatus; need_text:string|null; ai_rationale:string|null; note:string|null; site_id:string|null; tax_rate:number; sent_at:string|null; won_at:string|null; created_by:string; created_at:string; updated_at:string; }

// 報價單狀態合法轉移。won/lost 是終態——已成交/未成交的單不該再被切回草稿或
// 互轉,要重新報價就開一張新單。draft/sent 之間可以自由來回(送出前改內容很常見)。
export const QUOTE_STATUS_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  draft: ['sent'],
  sent: ['draft', 'won', 'lost'],
  won: [],
  lost: [],
};
export interface QuoteLine { id:string; quote_id:string; catalog_item_id:string|null; name:string; spec:string|null; qty:number; unit:string|null; unit_price_twd:number|null; section:QuoteLineSection; is_ai_suggested:boolean; sort_order:number; created_at:string; }
export const QUOTE_STATUS_LABEL: Record<QuoteStatus,string> = { draft:'草稿', sent:'已送出', won:'成交', lost:'未成交' };

// 標配套組
export interface BundleTemplate { id:string; name:string; applicable_to:string|null; note:string|null; active:boolean; created_at:string; updated_at:string; }
export interface BundleLine { id:string; bundle_id:string; catalog_item_id:string|null; name:string; spec:string|null; qty:number; unit:string|null; section:QuoteLineSection; sort_order:number; created_at:string; }

// voice-lab Lab 1:語音/打字介面 — 任務(派工最小版)+ 兩階段寫入提案
export type VoiceTaskStatus = 'open' | 'done';
export type VoiceSource = 'voice' | 'text' | 'web';
export interface VoiceTask { id:string; site_id:string; title:string; description:string|null; due_date:string|null; status:VoiceTaskStatus; created_by:string; source:VoiceSource; created_at:string; updated_at:string; }
export interface WriteProposal { token:string; action:'create_task'|'log_note'; payload:Record<string,unknown>; payload_hash:string; actor_id:string; source:'voice'|'text'; transcript_ref:string|null; capture_ref:string|null; created_at:string; expires_at:string; used_at:string|null; result:Record<string,unknown>|null; }

// 專案管理一案一工作面(06-project-board.md、08-專案管理新建清單.md)。
// tasks 表已從上面 VoiceTaskStatus 的兩態擴成四欄看板,這裡是看板版的型別——
// VoiceTaskStatus/VoiceTask 留給 voice-lab 既有程式碼用,不動它們。
export type TaskStatus = 'decide' | 'todo' | 'blocked' | 'done';

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  decide: '要老闆決定',
  todo: '待辦',
  blocked: '卡住・等料',
  done: '完成',
};

export const TASK_STATUS_ORDER: TaskStatus[] = ['decide', 'todo', 'blocked', 'done'];

export const TASK_TAGS = ['urgent', 'order', 'build', 'complaint', 'quote', 'maintain'] as const;
export type TaskTag = typeof TASK_TAGS[number];

export const TASK_TAG_LABEL: Record<TaskTag, string> = {
  urgent: '急',
  order: '叫料',
  build: '施工',
  complaint: '客訴',
  quote: '報價',
  maintain: '保養',
};

export interface TaskPhoto { path: string }

export interface Task {
  id: string;
  /** null = 待歸案(現場猜不出案子) */
  site_id: string | null;
  status: TaskStatus;
  title: string;
  tags: TaskTag[];
  /** 建立者即負責人,無指派流程——DB 欄位沿用既有的 created_by,不是 owner_id */
  created_by: string;
  /** status='blocked' 時必填 */
  blocked_on: string | null;
  /** 移入 blocked 的時間點,用來算「已卡 N 天」——不是 created_at */
  blocked_since: string | null;
  due_date: string | null;
  photos: TaskPhoto[];
  upload_pending: boolean;
  created_at: string;
  completed_at: string | null;
}

export interface SiteKnowledge {
  id: string;
  site_id: string;
  body: string;
  hall: string | null;
  pinned: boolean;
  promoted_to_checklist: boolean;
  author_id: string;
  created_at: string;
  updated_at: string;
  last_viewed_at: string | null;
}

export const SITE_KNOWLEDGE_PIN_LIMIT = 5;
