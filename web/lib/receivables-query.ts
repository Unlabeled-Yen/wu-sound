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

export interface ReceivablesTotals {
  receivableOpenTotal: number;
  payableOpenTotal: number;
  receivableOpenCount: number;
  payableOpenCount: number;
  overpaidCount: number;
}

// 只要求計算真正用到的四個欄位——帳簿看板為了效能只選這四欄(不含 sites join),
// 收窄型別讓它也能直接餵這個函式,不用為了型別對齊多查用不到的欄位。
export type ReceivableSummaryRow = Pick<ReceivableWithRemaining, 'direction' | 'status' | 'remaining_twd' | 'overpaid'>;

/**
 * 在手應收/應付合計的唯一實作。帳簿看板、應收應付頁、報表中心三處共用——
 * 「什麼算未結」的判斷只寫這一次,不再各自 reduce 一遍。
 *
 * 未結金額對負值取 0(超收超付不倒扣總額,只計入 overpaidCount 另外顯示),
 * 這樣「在手應收 $X」永遠是「你還能拿到的錢」,不會被超收的那幾筆拉低。
 */
export function summarizeReceivables(rows: ReceivableSummaryRow[]): ReceivablesTotals {
  const openRows = rows.filter((r) => r.status === 'open');
  const receivableOpen = openRows.filter((r) => r.direction === 'receivable');
  const payableOpen = openRows.filter((r) => r.direction === 'payable');

  return {
    receivableOpenTotal: receivableOpen.reduce((s, r) => s + Math.max(0, r.remaining_twd), 0),
    payableOpenTotal: payableOpen.reduce((s, r) => s + Math.max(0, r.remaining_twd), 0),
    receivableOpenCount: receivableOpen.length,
    payableOpenCount: payableOpen.length,
    // 超收超付只在「還沒結清」時算數——結清後的約定即使歷史資料有出入,
    // 已經不是老闆現在要處理的事,不該再跳警示。
    overpaidCount: openRows.filter((r) => r.overpaid).length,
  };
}
