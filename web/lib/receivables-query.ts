import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Receivable, ReceivableDirection, ReceivableStatus } from './types';

export interface ReceivableWithRemaining extends Receivable {
  sites?: { name: string } | null;
  settled_twd: number;
  remaining_twd: number;
  overpaid: boolean;
}

// 未結金額在 server 端算,不讓前端自己加(DB 算總數原則)。
// API route 與伺服器元件(receivables 頁、報表中心)共用同一份邏輯,避免三處各自重算。
export async function fetchReceivablesWithRemaining(
  sb: SupabaseClient,
  filters?: { status?: ReceivableStatus; direction?: ReceivableDirection },
): Promise<{ rows: ReceivableWithRemaining[]; error: string | null }> {
  let q = sb.from('receivables').select('*, sites(name)').order('created_at', { ascending: false });
  if (filters?.status) q = q.eq('status', filters.status);
  if (filters?.direction) q = q.eq('direction', filters.direction);
  const { data, error } = await q;
  if (error) return { rows: [], error: error.message };

  const receivables = (data ?? []) as Array<Receivable & { sites?: { name: string } | null }>;
  if (receivables.length === 0) return { rows: [], error: null };

  const linked = await sb
    .from('ledger_entries')
    .select('receivable_id, amount_twd')
    .in('receivable_id', receivables.map((r) => r.id))
    .eq('status', 'active');
  if (linked.error) return { rows: [], error: linked.error.message };

  const settledByReceivable = new Map<string, number>();
  for (const l of (linked.data ?? []) as Array<{ receivable_id: string; amount_twd: number }>) {
    settledByReceivable.set(l.receivable_id, (settledByReceivable.get(l.receivable_id) ?? 0) + l.amount_twd);
  }

  const rows: ReceivableWithRemaining[] = receivables.map((r) => {
    const settled = settledByReceivable.get(r.id) ?? 0;
    return { ...r, settled_twd: settled, remaining_twd: r.total_amount_twd - settled, overpaid: settled > r.total_amount_twd };
  });

  return { rows, error: null };
}
