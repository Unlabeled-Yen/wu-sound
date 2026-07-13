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
  on_site: '案場中',
  in_repair: '維修中',
  retired: '淘汰',
};

export function formatEquipmentLocation(status: EquipmentStatus, site_name?: string | null): string {
  if (status === 'on_site') return site_name ? `案場中 · ${site_name}` : '案場中';
  return EQUIPMENT_STATUS_LABEL[status];
}

// Phase 4: 內帳
export type LedgerDirection = 'income' | 'expense';
export type LedgerKind =
  | 'project' | 'loan' | 'other_income'
  | 'salary' | 'bonus' | 'reimbursement' | 'goods' | 'vehicle'
  | 'rent' | 'utility' | 'credit_card' | 'tax' | 'investment' | 'health' | 'other_expense';
export type InvoiceStatus = 'none' | 'to_issue' | 'issued';
export type LedgerStatus = 'active' | 'voided';

export interface LedgerEntry {
  id: string;
  occurred_on: string;
  direction: LedgerDirection;
  kind: LedgerKind;
  amount_twd: number;
  party: string | null;
  memo: string | null;
  is_external: boolean;
  invoice_status: InvoiceStatus;
  invoice_no: string | null;
  invoice_date: string | null;
  tax_amount_twd: number;
  status: LedgerStatus;
  voided_reason: string | null;
  source_batch_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
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
export const EXPENSE_KINDS: LedgerKind[] = [
  'salary', 'bonus', 'reimbursement', 'goods', 'vehicle',
  'rent', 'utility', 'credit_card', 'tax', 'investment', 'health', 'other_expense',
];

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
