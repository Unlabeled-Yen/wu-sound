'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';
import { pushMessageBestEffort, textMessage } from '@/lib/line';
import { findPayrollBatchId, syncPayrollMonth } from '@/lib/payroll-sync-server';

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

async function notifySubmitter(sb: ReturnType<typeof getSupabaseAdmin>, expenseId: string, text: string) {
  const { data: expense } = await sb.from('expenses').select('user_id').eq('id', expenseId).maybeSingle();
  if (!expense) return;
  const { data: user } = await sb
    .from('users')
    .select('line_user_id')
    .eq('id', expense.user_id)
    .maybeSingle();
  await pushMessageBestEffort(user?.line_user_id ?? null, [textMessage(text)]);
}

export async function confirmExpense(id: string): Promise<Result> {
  const { session, err } = await assertBoss();
  if (!session) return { ok: false, error: err ?? '未登入' };
  if (!id) return { ok: false, error: '缺少 id' };

  const sb = getSupabaseAdmin();
  const cur = await sb.from('expenses').select('status, spent_on, captured_at').eq('id', id).maybeSingle();
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

  await notifySubmitter(sb, id, '你送出的零用金已審核通過 ✓');

  // 這筆代墊所屬的月份如果已經結算過,審核通過要立刻併進那個月的代墊分錄——
  // 跟 LINE 推播同樣是 best-effort:同步失敗不擋審核本身,下次任何一次同步
  // (改獎金、改月薪、下一筆審核)都會自動補上,不會真的漏掉這筆錢。
  const month = ((cur.data.spent_on as string | null) ?? (cur.data.captured_at as string)).slice(0, 7);
  const batchId = await findPayrollBatchId(sb, month);
  if (batchId) {
    const sync = await syncPayrollMonth(sb, batchId, month, session.id);
    if (!sync.ok) console.error('[expenses.confirmExpense] 月結同步失敗', sync.error);
  }

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

  await notifySubmitter(sb, id, `你送出的零用金被退回,原因:${r}`);

  revalidatePath('/boss/expenses');
  return { ok: true };
}
