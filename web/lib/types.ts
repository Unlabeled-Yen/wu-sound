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
