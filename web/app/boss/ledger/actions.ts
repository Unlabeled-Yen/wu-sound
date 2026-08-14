'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';

interface Result { ok: boolean; error?: string }

async function assertBoss() {
  const session = await getSession();
  if (!session) return { session: null, err: '未登入' as string | null };
  if (session.role !== 'boss') return { session: null, err: '權限不足' as string | null };
  return { session, err: null };
}

export async function voidEntry(id: string, reason?: string): Promise<Result> {
  const { session, err } = await assertBoss();
  if (!session) return { ok: false, error: err ?? '未登入' };
  if (!id) return { ok: false, error: '缺少 id' };
  const r = (reason ?? '').trim();
  if (r.length < 2) return { ok: false, error: '請填寫作廢原因(至少 2 字)' };

  const sb = getSupabaseAdmin();
  const cur = await sb.from('ledger_entries').select('*').eq('id', id).maybeSingle();
  if (cur.error) return { ok: false, error: `查詢失敗: ${cur.error.message}` };
  if (!cur.data) return { ok: false, error: '找不到記錄' };
  if (cur.data.status === 'voided') return { ok: false, error: '此筆已作廢' };
  // status 與 state 兩欄必須同步作廢——state 是 receivable_payment_state view 與 v3
  // 不變量檢查依賴的權威欄位,只更新 status 會讓 view 誤把作廢的分錄仍算進已結清金額。
  const upd = await sb
    .from('ledger_entries')
    .update({ status: 'voided', state: 'voided', voided_reason: r })
    .eq('id', id)
    .select('*')
    .single();
  if (upd.error) return { ok: false, error: `作廢失敗: ${upd.error.message}` };

  await sb.from('audit_log').insert({
    actor_id: session.id,
    action: 'ledger.void',
    target_table: 'ledger_entries',
    target_id: id,
    diff: { before: cur.data, after: upd.data, reason: r },
  });

  revalidatePath('/boss/ledger');
  return { ok: true };
}
