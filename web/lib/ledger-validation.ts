import type { LedgerDirection, LedgerKind, InvoiceStatus } from './types';
import { INCOME_KINDS, EXPENSE_KINDS } from './types';

export interface LedgerInput {
  occurred_on: string;
  direction: LedgerDirection;
  kind: LedgerKind;
  amount_twd: number;
  party?: string | null;
  memo?: string | null;
  is_external: boolean;
  invoice_status: InvoiceStatus;
  invoice_no?: string | null;
  invoice_date?: string | null;
  tax_amount_twd: number;
}

export function validateLedger(v: LedgerInput): string | null {
  if (!v.occurred_on || !/^\d{4}-\d{2}-\d{2}$/.test(v.occurred_on)) return '日期格式錯誤';
  if (!v.direction || !(v.direction === 'income' || v.direction === 'expense')) return '方向錯誤';
  const okKinds = v.direction === 'income' ? INCOME_KINDS : EXPENSE_KINDS;
  if (!okKinds.includes(v.kind)) return '類別與方向不符';
  if (!Number.isInteger(v.amount_twd) || v.amount_twd <= 0) return '金額必須為正整數';
  if (!Number.isInteger(v.tax_amount_twd) || v.tax_amount_twd < 0) return '稅額必須為非負整數';
  if (!v.is_external && v.tax_amount_twd !== 0) return '未列外帳時稅額必須為 0';
  if (v.invoice_status === 'issued' && !v.is_external) return '已開立必為外帳';
  if (v.invoice_status === 'issued' && !v.invoice_date) return '已開立必須填發票日期';
  if (v.invoice_date && !/^\d{4}-\d{2}-\d{2}$/.test(v.invoice_date)) return '發票日期格式錯誤';
  return null;
}
