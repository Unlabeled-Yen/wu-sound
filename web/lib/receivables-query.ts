import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Receivable, ReceivableDirection, ReceivableStatus } from './types';

export interface ReceivableWithRemaining extends Receivable {
  sites?: { name: string } | null;
  settled_twd: number;
  remaining_twd: number;
  overpaid: boolean;
}

// 未結金額改由 supabase/migrations/015_receivable_payment_state_view.sql 的
// receivable_payment_state view 算(DB 算總數原則,前端/API 不再自己 reduce 加總)。
// API route 與伺服器元件(帳簿卡未結清單、報表中心)共用同一份邏輯,避免各自重算。
export async function fetchReceivablesWithRemaining(
  sb: SupabaseClient,
  filters?: { status?: ReceivableStatus; direction?: ReceivableDirection },
): Promise<{ rows: ReceivableWithRemaining[]; error: string | null }> {
  let q = sb.from('receivable_payment_state').select('*, sites(name)').order('created_at', { ascending: false });
  if (filters?.status) q = q.eq('status', filters.status);
  if (filters?.direction) q = q.eq('direction', filters.direction);
  const { data, error } = await q;
  if (error) return { rows: [], error: error.message };

  const rows = (data ?? []) as Array<
    Receivable & { sites?: { name: string } | null; settled_twd: number; remaining_twd: number; overpaid: boolean }
  >;
  return { rows, error: null };
}
