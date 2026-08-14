import type { ReceivableDirection } from './types';

export interface ReceivableInput {
  direction: ReceivableDirection;
  party: string;
  site_id?: string | null;
  total_amount_twd: number;
  memo?: string | null;
  /** 選填。'YYYY-MM-DD' 或 null——留空代表「未排定」,不是「今天」。 */
  agreed_due_date?: string | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateReceivable(v: ReceivableInput): string | null {
  if (!v.direction || !(v.direction === 'receivable' || v.direction === 'payable')) return '方向錯誤';
  if (!v.party || !v.party.trim()) return '對象不得為空';
  if (!Number.isInteger(v.total_amount_twd) || v.total_amount_twd <= 0) return '約定總額必須為正整數';
  if (v.agreed_due_date != null && !DATE_RE.test(v.agreed_due_date)) return '約定日期格式錯誤';
  return null;
}
