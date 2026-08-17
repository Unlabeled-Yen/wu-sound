import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { KIND_TO_JOURNAL } from './types';
import { computePayrollSyncPlan, type PayrollEntryKind, type PayrollSyncExisting, type PayrollSyncTarget } from './payroll-sync';

// 月結是薪資/獎金/代墊三種固定支出的處理中心,不是一次性鎖定動作。
// occurred_on 固定訂在「當月 10 號」(老闆實際發薪日),不是月底——薪資從第一次
// 結算開始就跟真實金流對齊,後續同步只改金額,不會再動日期基準之外的邏輯。

const PAYROLL_KINDS: ReadonlySet<string> = new Set(['salary', 'bonus', 'reimbursement']);

interface UserRow { id: string; name: string; active: boolean }
interface PayProfileRow { user_id: string; monthly_salary_twd: number; effective_from: string }
interface BonusRow { user_id: string; amount_twd: number; memo: string | null }
interface ExpenseRow { id: string; user_id: string; amount_twd: number | null; status: string; spent_on: string | null; captured_at: string; booked_batch_id: string | null }

function monthOfExpense(r: ExpenseRow): string {
  return (r.spent_on ?? r.captured_at).slice(0, 7);
}

// 這個月是否已經結算過(book_batches 有沒有那一列)——只讀,不建立。給獎金/月薪/
// 代墊審核這些「順手觸發同步」的入口用:還沒結算過的月份不該因為改一筆獎金草稿
// 就默默生出一批帳務分錄,那必須是老闆在月結中心按「送出結算」的明確動作。
export async function findPayrollBatchId(sb: SupabaseClient, month: string): Promise<string | null> {
  const batchMonth = `${month}-01`;
  const r = await sb.from('book_batches').select('id').eq('month', batchMonth).maybeSingle();
  if (r.error || !r.data) return null;
  return r.data.id as string;
}

// 取得或建立這個月的結算批次——只有月結中心的「送出結算」按鈕呼叫這個,
// 建立本身不寫任何分錄,分錄由 syncPayrollMonth 負責。
export async function getOrCreatePayrollBatch(
  sb: SupabaseClient,
  month: string,
  actorId: string,
): Promise<{ batchId: string } | { error: string }> {
  const batchMonth = `${month}-01`;
  const existing = await sb.from('book_batches').select('id').eq('month', batchMonth).maybeSingle();
  if (existing.error) return { error: `查詢失敗: ${existing.error.message}` };
  if (existing.data) return { batchId: existing.data.id as string };

  const ins = await sb.from('book_batches').insert({ month: batchMonth, created_by: actorId, totals: {} }).select('id').single();
  if (ins.error || !ins.data) {
    const msg = ins.error?.message ?? 'unknown';
    if (/duplicate|unique/i.test(msg)) {
      const retry = await sb.from('book_batches').select('id').eq('month', batchMonth).maybeSingle();
      if (retry.data) return { batchId: retry.data.id as string };
    }
    return { error: `建立月結批次失敗: ${msg}` };
  }
  return { batchId: ins.data.id as string };
}

export interface PayrollSyncResult {
  ok: true;
  batchId: string;
  inserted: number;
  updated: number;
  voided: number;
  skippedNoProfile: string[];
}
export interface PayrollSyncError {
  ok: false;
  error: string;
}

// 核心同步:把「這個月現在應該有的數字」(pay profile 月薪 + 獎金草稿 + 已確認代墊
// 彙總)跟「帳上現在寫的數字」對齊。老闆改任何一項來源資料後呼叫這個函式,
// 帳務分錄就會跟著更新/新增/作廢——這是月結中心「處理中心」而非「一次性鎖」
// 的核心機制。
export async function syncPayrollMonth(
  sb: SupabaseClient,
  batchId: string,
  month: string,
  actorId: string,
): Promise<PayrollSyncResult | PayrollSyncError> {
  const batchMonth = `${month}-01`;
  const occurredOn = `${month}-10`;
  const [y, m] = month.split('-').map(Number);
  const monthEndDate = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
  const monthLabel = `${m}月`;

  const [usersRes, profilesRes, bonusesRes, expensesRes] = await Promise.all([
    sb.from('users').select('id, name, active').eq('active', true),
    sb.from('user_pay_profiles').select('user_id, monthly_salary_twd, effective_from').lte('effective_from', monthEndDate).order('effective_from', { ascending: false }),
    sb.from('payroll_bonuses').select('user_id, amount_twd, memo').eq('batch_month', batchMonth),
    sb.from('expenses').select('id, user_id, amount_twd, status, spent_on, captured_at, booked_batch_id').in('status', ['confirmed', 'booked']),
  ]);
  if (usersRes.error) return { ok: false, error: `查詢失敗: ${usersRes.error.message}` };
  if (profilesRes.error) return { ok: false, error: `查詢失敗: ${profilesRes.error.message}` };
  if (bonusesRes.error) return { ok: false, error: `查詢失敗: ${bonusesRes.error.message}` };
  if (expensesRes.error) return { ok: false, error: `查詢失敗: ${expensesRes.error.message}` };

  const users = (usersRes.data ?? []) as UserRow[];
  const profiles = (profilesRes.data ?? []) as PayProfileRow[];
  const bonuses = (bonusesRes.data ?? []) as BonusRow[];
  const allExpenses = (expensesRes.data ?? []) as ExpenseRow[];

  // 這個月的代墊只算兩種:還沒併過的(confirmed)、或上次已經併進「這一批」的
  // (booked 且 booked_batch_id 就是這一批)——不能撈全部 booked,那會把掛在
  // 其他月份批次底下的代墊也算進來。
  const monthExpenses = allExpenses.filter(
    (r) => monthOfExpense(r) === month && (r.status === 'confirmed' || (r.status === 'booked' && r.booked_batch_id === batchId)),
  );

  const salaryByUser = new Map<string, number>();
  for (const u of users) {
    const applicable = profiles.filter((p) => p.user_id === u.id);
    if (applicable.length > 0) salaryByUser.set(u.id, applicable[0].monthly_salary_twd);
  }
  const bonusByUser = new Map<string, BonusRow>();
  for (const b of bonuses) bonusByUser.set(b.user_id, b);
  const reimbursementByUser = new Map<string, number>();
  for (const e of monthExpenses) {
    reimbursementByUser.set(e.user_id, (reimbursementByUser.get(e.user_id) ?? 0) + (e.amount_twd ?? 0));
  }

  const skippedNoProfile = users
    .filter((u) => !salaryByUser.has(u.id))
    .filter((u) => (bonusByUser.get(u.id)?.amount_twd ?? 0) > 0 || (reimbursementByUser.get(u.id) ?? 0) > 0)
    .map((u) => u.name);

  const targets: PayrollSyncTarget[] = [];
  for (const u of users) {
    const salary = salaryByUser.get(u.id) ?? 0;
    const bonus = bonusByUser.get(u.id);
    const reimbursement = reimbursementByUser.get(u.id) ?? 0;
    if (salary > 0) targets.push({ party: u.name, kind: 'salary', amount_twd: salary, memo: `${monthLabel}薪資結算` });
    if (bonus && bonus.amount_twd > 0) {
      targets.push({
        party: u.name,
        kind: 'bonus',
        amount_twd: bonus.amount_twd,
        memo: bonus.memo ? `${monthLabel}獎金 · ${bonus.memo}` : `${monthLabel}獎金`,
      });
    }
    if (reimbursement > 0) targets.push({ party: u.name, kind: 'reimbursement', amount_twd: reimbursement, memo: `${monthLabel}零用金結算` });
  }

  const existingRes = await sb
    .from('ledger_entries')
    .select('id, party, kind, amount_twd, memo, occurred_on')
    .eq('source_batch_id', batchId)
    .neq('state', 'voided');
  if (existingRes.error) return { ok: false, error: `查詢分錄失敗: ${existingRes.error.message}` };
  const existing: PayrollSyncExisting[] = (existingRes.data ?? [])
    .filter((r) => PAYROLL_KINDS.has(r.kind as string))
    .map((r) => ({
      id: r.id as string,
      party: (r.party as string | null) ?? '',
      kind: r.kind as PayrollEntryKind,
      amount_twd: r.amount_twd as number,
      memo: r.memo as string | null,
      occurred_on: r.occurred_on as string,
    }));

  const plan = computePayrollSyncPlan(targets, existing, occurredOn);
  const failures: string[] = [];

  for (const t of plan.toInsert) {
    const ins = await sb
      .from('ledger_entries')
      .insert({
        occurred_on: occurredOn,
        direction: 'expense',
        kind: t.kind,
        journal: KIND_TO_JOURNAL[t.kind] ?? 'payroll',
        amount_twd: t.amount_twd,
        party: t.party,
        memo: t.memo,
        is_external: false,
        invoice_status: 'none',
        tax_amount_twd: 0,
        source_batch_id: batchId,
        created_by: actorId,
      })
      .select('id')
      .single();
    if (ins.error) {
      if (/duplicate|unique/i.test(ins.error.message)) continue; // 併發同步:別的請求已經寫過了
      failures.push(`${t.party}(${t.kind}) 新增失敗: ${ins.error.message}`);
    }
  }

  for (const u of plan.toUpdate) {
    const upd = await sb.from('ledger_entries').update({ amount_twd: u.amount_twd, memo: u.memo, occurred_on: occurredOn }).eq('id', u.id);
    if (upd.error) failures.push(`${u.party}(${u.kind}) 更新失敗: ${upd.error.message}`);
  }

  for (const v of plan.toVoid) {
    const upd = await sb
      .from('ledger_entries')
      .update({ status: 'voided', state: 'voided', voided_reason: '月結同步:金額歸零或項目移除' })
      .eq('id', v.id);
    if (upd.error) failures.push(`${v.party}(${v.kind}) 作廢失敗: ${upd.error.message}`);
  }

  const toBook = monthExpenses.filter((e) => e.status === 'confirmed').map((e) => e.id);
  if (toBook.length > 0) {
    const bookUpd = await sb.from('expenses').update({ status: 'booked', booked_batch_id: batchId }).in('id', toBook).eq('status', 'confirmed');
    if (bookUpd.error) failures.push(`標記零用金已結算失敗: ${bookUpd.error.message}`);
  }

  if (failures.length > 0) {
    return { ok: false, error: `部分同步失敗,已完成的不會重複、可安全重按:${failures.join('; ')}` };
  }

  const totals: Record<string, { name: string; salary: number; bonus: number; reimbursement: number }> = {};
  for (const u of users) {
    const salary = salaryByUser.get(u.id) ?? 0;
    const bonus = bonusByUser.get(u.id)?.amount_twd ?? 0;
    const reimbursement = reimbursementByUser.get(u.id) ?? 0;
    if (salary > 0 || bonus > 0 || reimbursement > 0) totals[u.id] = { name: u.name, salary, bonus, reimbursement };
  }
  await sb.from('book_batches').update({ totals }).eq('id', batchId);

  await sb.from('audit_log').insert({
    actor_id: actorId,
    action: 'payroll.sync',
    target_table: 'book_batches',
    target_id: batchId,
    diff: {
      month,
      inserted: plan.toInsert.map((t) => ({ party: t.party, kind: t.kind, amount_twd: t.amount_twd })),
      updated: plan.toUpdate.map((t) => ({ party: t.party, kind: t.kind, amount_twd: t.amount_twd })),
      voided: plan.toVoid.map((t) => ({ party: t.party, kind: t.kind })),
    },
  });

  return {
    ok: true,
    batchId,
    inserted: plan.toInsert.length,
    updated: plan.toUpdate.length,
    voided: plan.toVoid.length,
    skippedNoProfile,
  };
}
