'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';

interface Result {
  ok: boolean;
  error?: string;
}

async function assertBoss() {
  const session = await getSession();
  if (!session) return { session: null, err: '未登入' };
  if (session.role !== 'boss') return { session: null, err: '權限不足' };
  return { session, err: null };
}

export async function confirmExpense(id: string): Promise<Result> {
  const { session, err } = await assertBoss();
  if (!session) return { ok: false, error: err ?? '未登入' };
  if (!id) return { ok: false, error: '缺少 id' };

  const sb = getSupabaseAdmin();
  const cur = await sb.from('expenses').select('status').eq('id', id).maybeSingle();
  if (cur.error) return { ok: false, error: `查詢失敗: ${cur.error.message}` };
  if (!cur.data) return { ok: false, error: '找不到記錄' };
  if (cur.data.status !== 'submitted') return { ok: false, error: '此筆非待審核狀態' };

  const upd = await sb.from('expenses').update({ status: 'confirmed' }).eq('id', id);
  if (upd.error) return { ok: false, error: `確認失敗: ${upd.error.message}` };

  await sb.from('audit_log').insert({
    actor_id: session.id,
    action: 'confirm',
    target_table: 'expenses',
    target_id: id,
    diff: { before: { status: 'submitted' }, after: { status: 'confirmed' } },
  });

  revalidatePath('/boss/expenses');
  return { ok: true };
}

export async function rejectExpense(id: string, reason: string): Promise<Result> {
  const { session, err } = await assertBoss();
  if (!session) return { ok: false, error: err ?? '未登入' };
  if (!id) return { ok: false, error: '缺少 id' };
  const r = reason.trim();
  if (!r) return { ok: false, error: '請填退回原因' };

  const sb = getSupabaseAdmin();
  const cur = await sb.from('expenses').select('status').eq('id', id).maybeSingle();
  if (cur.error) return { ok: false, error: `查詢失敗: ${cur.error.message}` };
  if (!cur.data) return { ok: false, error: '找不到記錄' };
  if (cur.data.status !== 'submitted') return { ok: false, error: '此筆非待審核狀態' };

  const upd = await sb
    .from('expenses')
    .update({ status: 'rejected', rejected_reason: r })
    .eq('id', id);
  if (upd.error) return { ok: false, error: `退回失敗: ${upd.error.message}` };

  await sb.from('audit_log').insert({
    actor_id: session.id,
    action: 'reject',
    target_table: 'expenses',
    target_id: id,
    diff: {
      before: { status: 'submitted' },
      after: { status: 'rejected', rejected_reason: r },
    },
  });

  revalidatePath('/boss/expenses');
  return { ok: true };
}
