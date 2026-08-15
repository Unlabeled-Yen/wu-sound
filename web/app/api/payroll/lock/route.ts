import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';
import { KIND_TO_JOURNAL } from '@/lib/types';

export const runtime = 'nodejs';

const MONTH_RE = /^\d{4}-\d{2}$/;

interface UserRow { id: string; name: string; active: boolean }
interface PayProfileRow { user_id: string; monthly_salary_twd: number; effective_from: string }
interface BonusRow { user_id: string; amount_twd: number; memo: string | null }
interface ExpenseRow { id: string; user_id: string; amount_twd: number | null; spent_on: string | null; captured_at: string }

function monthOf(spentOn: string | null, capturedAt: string): string {
  return (spentOn ?? capturedAt).slice(0, 7);
}

// 月結「鎖定並寫入帳務」——原本兩步(/boss/close 鎖定 + 帳務頁再手動匯入零用金)
// 合併成一步,固定月薪/獎金也一起寫。三種分錄各自獨立判斷有沒有金額才寫,
// 沒有 pay profile 的人不寫薪資分錄,但整批結果會回報「誰被跳過」,不能默默漏掉。
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });
  if (session.role !== 'boss') return NextResponse.json({ error: '權限不足' }, { status: 403 });

  let body: { month?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求' }, { status: 400 });
  }
  const month = typeof body.month === 'string' ? body.month : '';
  if (!MONTH_RE.test(month)) return NextResponse.json({ error: '月份格式錯誤' }, { status: 400 });

  const sb = getSupabaseAdmin();
  const batchMonth = `${month}-01`;
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const occurredOn = `${month}-${String(lastDay).padStart(2, '0')}`;
  const monthLabel = `${m}月`;

  // 已鎖定就不能重鎖——沿用 book_batches unique(month) 當月級鎖。
  const already = await sb.from('book_batches').select('id').eq('month', batchMonth).maybeSingle();
  if (already.error) return NextResponse.json({ error: `查詢失敗: ${already.error.message}` }, { status: 500 });
  if (already.data) return NextResponse.json({ error: '這個月已經鎖定過了' }, { status: 409 });

  // 擋未審核的零用金(同現行 /boss/close 邏輯)。
  const pend = await sb.from('expenses').select('id, spent_on, captured_at').in('status', ['draft', 'submitted']);
  if (pend.error) return NextResponse.json({ error: `查詢失敗: ${pend.error.message}` }, { status: 500 });
  const pendingCount = ((pend.data ?? []) as ExpenseRow[]).filter((r) => monthOf(r.spent_on, r.captured_at) === month).length;
  if (pendingCount > 0) return NextResponse.json({ error: `尚有 ${pendingCount} 筆零用金未處理,無法結算` }, { status: 409 });

  const [usersRes, profilesRes, bonusesRes, confirmedRes] = await Promise.all([
    sb.from('users').select('id, name, active').eq('active', true),
    sb.from('user_pay_profiles').select('user_id, monthly_salary_twd, effective_from').lte('effective_from', occurredOn).order('effective_from', { ascending: false }),
    sb.from('payroll_bonuses').select('user_id, amount_twd, memo').eq('batch_month', batchMonth),
    sb.from('expenses').select('id, user_id, amount_twd, spent_on, captured_at').eq('status', 'confirmed'),
  ]);
  if (usersRes.error) return NextResponse.json({ error: `查詢失敗: ${usersRes.error.message}` }, { status: 500 });
  if (profilesRes.error) return NextResponse.json({ error: `查詢失敗: ${profilesRes.error.message}` }, { status: 500 });
  if (bonusesRes.error) return NextResponse.json({ error: `查詢失敗: ${bonusesRes.error.message}` }, { status: 500 });
  if (confirmedRes.error) return NextResponse.json({ error: `查詢失敗: ${confirmedRes.error.message}` }, { status: 500 });

  const users = (usersRes.data ?? []) as UserRow[];
  const profiles = (profilesRes.data ?? []) as PayProfileRow[];
  const bonuses = (bonusesRes.data ?? []) as BonusRow[];
  const confirmed = ((confirmedRes.data ?? []) as ExpenseRow[]).filter((r) => monthOf(r.spent_on, r.captured_at) === month);

  const salaryByUser = new Map<string, number>();
  for (const u of users) {
    const applicable = profiles.filter((p) => p.user_id === u.id);
    if (applicable.length > 0) salaryByUser.set(u.id, applicable[0].monthly_salary_twd);
  }
  const bonusByUser = new Map<string, BonusRow>();
  for (const b of bonuses) bonusByUser.set(b.user_id, b);
  const reimbursementByUser = new Map<string, number>();
  for (const e of confirmed) {
    reimbursementByUser.set(e.user_id, (reimbursementByUser.get(e.user_id) ?? 0) + (e.amount_twd ?? 0));
  }

  const skippedNoProfile = users.filter((u) => !salaryByUser.has(u.id) && (bonusByUser.has(u.id) || reimbursementByUser.has(u.id)));

  const hasAnything = salaryByUser.size > 0 || bonusByUser.size > 0 || reimbursementByUser.size > 0;
  if (!hasAnything) return NextResponse.json({ error: '本月沒有任何薪資/獎金/代墊,無需結算' }, { status: 400 });

  const totals: Record<string, { name: string; salary: number; bonus: number; reimbursement: number }> = {};
  for (const u of users) {
    const salary = salaryByUser.get(u.id) ?? 0;
    const bonus = bonusByUser.get(u.id)?.amount_twd ?? 0;
    const reimbursement = reimbursementByUser.get(u.id) ?? 0;
    if (salary > 0 || bonus > 0 || reimbursement > 0) totals[u.id] = { name: u.name, salary, bonus, reimbursement };
  }

  const batchIns = await sb.from('book_batches').insert({ month: batchMonth, created_by: session.id, totals }).select('id').single();
  if (batchIns.error || !batchIns.data) {
    const msg = batchIns.error?.message ?? 'unknown';
    if (/duplicate|unique/i.test(msg)) return NextResponse.json({ error: '這個月已經鎖定過了' }, { status: 409 });
    return NextResponse.json({ error: `建立月結批次失敗: ${msg}` }, { status: 500 });
  }
  const batchId = batchIns.data.id as string;

  if (confirmed.length > 0) {
    const upd = await sb
      .from('expenses')
      .update({ status: 'booked', booked_batch_id: batchId })
      .in('id', confirmed.map((r) => r.id))
      .eq('status', 'confirmed');
    if (upd.error) return NextResponse.json({ error: `標記零用金已結算失敗: ${upd.error.message}`, batch_id: batchId }, { status: 500 });
  }

  const written = { salary: 0, bonus: 0, reimbursement: 0 };
  const failures: string[] = [];
  const actorId = session.id;

  async function insertEntry(userName: string, kind: 'salary' | 'bonus' | 'reimbursement', amount: number, memo: string) {
    const ins = await sb.from('ledger_entries').insert({
      occurred_on: occurredOn,
      direction: 'expense',
      kind,
      journal: KIND_TO_JOURNAL[kind] ?? 'payroll',
      amount_twd: amount,
      party: userName,
      memo,
      is_external: false,
      invoice_status: 'none',
      tax_amount_twd: 0,
      source_batch_id: batchId,
      created_by: actorId,
    }).select('id').single();
    if (ins.error) {
      if (/duplicate|unique/i.test(ins.error.message)) return; // 去重:重按不重複
      failures.push(`${userName}(${kind}): ${ins.error.message}`);
      return;
    }
    written[kind] += 1;
    await sb.from('audit_log').insert({
      actor_id: actorId,
      action: 'payroll.lock',
      target_table: 'ledger_entries',
      target_id: ins.data!.id,
      diff: { batch_id: batchId, kind, party: userName, amount_twd: amount },
    });
  }

  for (const u of users) {
    const salary = salaryByUser.get(u.id) ?? 0;
    const bonus = bonusByUser.get(u.id);
    const reimbursement = reimbursementByUser.get(u.id) ?? 0;
    if (salary > 0) await insertEntry(u.name, 'salary', salary, `${monthLabel}薪資結算`);
    if (bonus && bonus.amount_twd > 0) await insertEntry(u.name, 'bonus', bonus.amount_twd, bonus.memo ? `${monthLabel}獎金 · ${bonus.memo}` : `${monthLabel}獎金`);
    if (reimbursement > 0) await insertEntry(u.name, 'reimbursement', reimbursement, `${monthLabel}零用金結算`);
  }

  if (failures.length > 0) {
    return NextResponse.json(
      { error: `部分分錄寫入失敗,已寫入的不會重複、可安全重按:${failures.join('; ')}`, batch_id: batchId, written },
      { status: 500 },
    );
  }

  await sb.from('audit_log').insert({
    actor_id: session.id,
    action: 'payroll.close_month',
    target_table: 'book_batches',
    target_id: batchId,
    diff: { month, written, skipped_no_profile: skippedNoProfile.map((u) => u.name) },
  });

  return NextResponse.json({
    ok: true,
    batch_id: batchId,
    written,
    skipped_no_profile: skippedNoProfile.map((u) => u.name),
  });
}
