import type { ReceivableDirection } from './types';

export interface ReceivableInput {
  direction: ReceivableDirection;
  party: string;
  site_id?: string | null;
  total_amount_twd: number;
  memo?: string | null;
}

export function validateReceivable(v: ReceivableInput): string | null {
  if (!v.direction || !(v.direction === 'receivable' || v.direction === 'payable')) return '方向錯誤';
  if (!v.party || !v.party.trim()) return '對象不得為空';
  if (!Number.isInteger(v.total_amount_twd) || v.total_amount_twd <= 0) return '約定總額必須為正整數';
  return null;
}
