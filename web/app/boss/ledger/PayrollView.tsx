import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/supabase';
import { LEDGER_KIND_LABEL, type LedgerEntry } from '@/lib/types';
import type { PayProfile, PayrollBonus } from '@/lib/types';
import { resolveMonthlySalary } from '@/lib/payroll';
import PayProfileButton from './payroll/PayProfileButton';
import BonusButton from './payroll/BonusButton';
import LockPayrollButton from './payroll/LockPayrollButton';
import { fmt } from './ledger-page-helpers';

interface UserRow { id: string; name: string; active: boolean }
interface ExpenseRow { id: string; user_id: string; amount_twd: number | null; status: string; spent_on: string | null; captured_at: string }

function monthOf(spentOn: string | null, capturedAt: string): string {
  return (spentOn ?? capturedAt).slice(0, 7);
}

// 月結:零用金管理+薪資結算併進帳務管理的第五個模式。見
// docs/payroll-pettycash-merge-spec.md。單月視角——「已鎖定」以 book_batches
// 有沒有該月份的紀錄為準,鎖定後這裡改顯示 ledger_entries 裡真正寫入的數字
// (帳務分錄才是唯一真相),不是重算 pay profile/獎金草稿。
export async function PayrollView({ sb, month }: { sb: ReturnType<typeof getSupabaseAdmin>; month: string }) {
  const batchMonth = `${month}-01`;
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const monthEndDate = `${month}-${String(lastDay).padStart(2, '0')}`;

  const batchRes = await sb.from('book_batches').select('id, created_at').eq('month', batchMonth).maybeSingle();
  if (batchRes.error) {
    return (
      <div className="rounded-2xl px-4 py-3 text-[13px]" style={{ background: 'rgba(224,122,122,0.08)', border: '1px solid rgba(224,122,122,0.34)', color: 'var(--nm-danger-glass-text)' }}>
        讀取失敗,以下數字不可信:{batchRes.error.message}
      </div>
    );
  }
  const locked = batchRes.data;

  const usersRes = await sb.from('users').select('id, name, active').eq('active', true).order('name');
  if (usersRes.error) {
    return (
      <div className="rounded-2xl px-4 py-3 text-[13px]" style={{ background: 'rgba(224,122,122,0.08)', border: '1px solid rgba(224,122,122,0.34)', color: 'var(--nm-danger-glass-text)' }}>
        讀取失敗,以下數字不可信:{usersRes.error.message}
      </div>
    );
  }
  const users = (usersRes.data ?? []) as UserRow[];

  if (locked) {
    const entriesRes = await sb.from('ledger_entries').select('*').eq('source_batch_id', locked.id).neq('state', 'voided').order('party');
    if (entriesRes.error) {
      return (
        <div className="rounded-2xl px-4 py-3 text-[13px]" style={{ background: 'rgba(224,122,122,0.08)', border: '1px solid rgba(224,122,122,0.34)', color: 'var(--nm-danger-glass-text)' }}>
          讀取失敗,以下數字不可信:{entriesRes.error.message}
        </div>
      );
    }
    const entries = (entriesRes.data ?? []) as LedgerEntry[];
    const byParty = new Map<string, { salary: number; bonus: number; reimbursement: number }>();
    for (const e of entries) {
      const key = e.party ?? '?';
      const cur = byParty.get(key) ?? { salary: 0, bonus: 0, reimbursement: 0 };
      if (e.kind === 'salary') cur.salary += e.amount_twd;
      else if (e.kind === 'bonus') cur.bonus += e.amount_twd;
      else if (e.kind === 'reimbursement') cur.reimbursement += e.amount_twd;
      byParty.set(key, cur);
    }
    const grandTotal = entries.reduce((s, e) => s + e.amount_twd, 0);

    return (
      <div className="space-y-4">
        <div className="rounded-2xl px-4 py-3 text-[13px] flex items-center gap-2" style={{ background: 'rgba(126,207,157,0.08)', border: '1px solid rgba(126,207,157,0.26)', color: 'var(--nm-success-glass-text)' }}>
          {month} 已鎖定 · 共 {entries.length} 筆分錄 · 合計 ${fmt(grandTotal)}
        </div>
        <div className="rounded-2xl nm-raised overflow-x-auto">
          <table className="w-full text-[13px]" style={{ minWidth: 640, borderCollapse: 'collapse' }}>
            <thead style={{ background: 'rgba(20,20,24,0.92)' }}>
              <tr style={{ color: 'var(--nm-text-muted)' }}>
                <th className="text-left px-3 py-2 font-normal whitespace-nowrap">姓名</th>
                <th className="text-right px-3 py-2 font-normal whitespace-nowrap">薪資</th>
                <th className="text-right px-3 py-2 font-normal whitespace-nowrap">獎金</th>
                <th className="text-right px-3 py-2 font-normal whitespace-nowrap">代墊零用金</th>
                <th className="text-right px-3 py-2 font-normal whitespace-nowrap">小計</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(byParty.entries()).map(([party, v]) => (
                <tr key={party} style={{ borderTop: '1px solid var(--nm-border-hair)' }}>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--nm-text-body)' }}>{party}</td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>{v.salary > 0 ? `$${fmt(v.salary)}` : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>{v.bonus > 0 ? `$${fmt(v.bonus)}` : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>{v.reimbursement > 0 ? `$${fmt(v.reimbursement)}` : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold whitespace-nowrap" style={{ color: 'var(--nm-text-body)' }}>${fmt(v.salary + v.bonus + v.reimbursement)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <a href={`/api/boss/close/${month}/export.csv`} className="nm-btn text-[13px]">匯出零用金 CSV</a>
          <Link href={`/boss/ledger?mode=all&month=${month}`} className="text-[13px] underline" style={{ color: 'var(--nm-text-muted)' }}>到「全部」模式看這批分錄</Link>
        </div>
      </div>
    );
  }

  // 未鎖定:即時預覽——月薪(pay profile)+ 獎金草稿(payroll_bonuses)+ 代墊彙總(confirmed expenses)。
  const [profilesRes, bonusesRes, expensesRes] = await Promise.all([
    sb.from('user_pay_profiles').select('*').lte('effective_from', monthEndDate).order('effective_from', { ascending: false }),
    sb.from('payroll_bonuses').select('*').eq('batch_month', batchMonth),
    sb.from('expenses').select('id, user_id, amount_twd, status, spent_on, captured_at').in('status', ['draft', 'submitted', 'confirmed']),
  ]);
  if (profilesRes.error || bonusesRes.error || expensesRes.error) {
    return (
      <div className="rounded-2xl px-4 py-3 text-[13px]" style={{ background: 'rgba(224,122,122,0.08)', border: '1px solid rgba(224,122,122,0.34)', color: 'var(--nm-danger-glass-text)' }}>
        讀取失敗,以下數字不可信:{profilesRes.error?.message ?? bonusesRes.error?.message ?? expensesRes.error?.message}
      </div>
    );
  }
  const profiles = (profilesRes.data ?? []) as PayProfile[];
  const bonuses = (bonusesRes.data ?? []) as PayrollBonus[];
  const allExpenses = ((expensesRes.data ?? []) as ExpenseRow[]).filter((r) => monthOf(r.spent_on, r.captured_at) === month);
  const pending = allExpenses.filter((r) => r.status === 'draft' || r.status === 'submitted');
  const confirmed = allExpenses.filter((r) => r.status === 'confirmed');

  const pendingByUser = new Map<string, number>();
  for (const r of pending) pendingByUser.set(r.user_id, (pendingByUser.get(r.user_id) ?? 0) + 1);
  const reimbursementByUser = new Map<string, { total: number; count: number }>();
  for (const r of confirmed) {
    const cur = reimbursementByUser.get(r.user_id) ?? { total: 0, count: 0 };
    cur.total += r.amount_twd ?? 0;
    cur.count += 1;
    reimbursementByUser.set(r.user_id, cur);
  }
  const bonusByUser = new Map<string, PayrollBonus>();
  for (const b of bonuses) bonusByUser.set(b.user_id, b);

  const blocked = pending.length > 0;

  const skippedNames = users
    .filter((u) => resolveMonthlySalary(profiles, u.id, monthEndDate) === null)
    .filter((u) => (bonusByUser.get(u.id)?.amount_twd ?? 0) > 0 || (reimbursementByUser.get(u.id)?.total ?? 0) > 0)
    .map((u) => u.name);

  let grandSalary = 0, grandBonus = 0, grandReimbursement = 0;
  for (const u of users) {
    grandSalary += resolveMonthlySalary(profiles, u.id, monthEndDate) ?? 0;
    grandBonus += bonusByUser.get(u.id)?.amount_twd ?? 0;
    grandReimbursement += reimbursementByUser.get(u.id)?.total ?? 0;
  }
  const hasAnything = grandSalary > 0 || grandBonus > 0 || grandReimbursement > 0;

  return (
    <div className="space-y-4">
      {blocked && (
        <div className="rounded-2xl px-5 py-4 text-[13px]" style={{ background: 'rgba(224,122,122,0.1)', border: '1px solid rgba(224,122,122,0.34)', color: 'var(--nm-danger-glass-text)' }}>
          <div className="text-[15px] font-bold">尚有 {pending.length} 筆零用金未處理,無法鎖定月結</div>
          <p className="mt-2 leading-relaxed">
            到 <Link href="/boss/expenses" className="underline font-semibold">零用金審核</Link> 逐筆確認/退回,處理完再回來鎖定。
          </p>
        </div>
      )}

      <div className="rounded-2xl nm-raised overflow-x-auto">
        <table className="w-full text-[13px]" style={{ minWidth: 760, borderCollapse: 'collapse' }}>
          <thead style={{ background: 'rgba(20,20,24,0.92)' }}>
            <tr style={{ color: 'var(--nm-text-muted)' }}>
              <th className="text-left px-3 py-2 font-normal whitespace-nowrap">姓名</th>
              <th className="text-left px-3 py-2 font-normal whitespace-nowrap">固定月薪</th>
              <th className="text-left px-3 py-2 font-normal whitespace-nowrap">獎金</th>
              <th className="text-right px-3 py-2 font-normal whitespace-nowrap">代墊零用金</th>
              <th className="text-right px-3 py-2 font-normal whitespace-nowrap">小計</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const salary = resolveMonthlySalary(profiles, u.id, monthEndDate);
              const bonus = bonusByUser.get(u.id);
              const reimbursement = reimbursementByUser.get(u.id);
              const subtotal = (salary ?? 0) + (bonus?.amount_twd ?? 0) + (reimbursement?.total ?? 0);
              return (
                <tr key={u.id} style={{ borderTop: '1px solid var(--nm-border-hair)' }}>
                  <td className="px-3 py-2 align-top whitespace-nowrap" style={{ color: 'var(--nm-text-body)' }}>{u.name}</td>
                  <td className="px-3 py-2 align-top">
                    <div className="flex flex-col gap-1 items-start">
                      <span className="tabular-nums" style={{ color: salary ? 'var(--nm-text-body)' : 'var(--nm-text-faint)' }}>
                        {salary ? `$${fmt(salary)}` : '未設定'}
                      </span>
                      <PayProfileButton userId={u.id} currentSalary={salary} />
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="flex flex-col gap-1 items-start">
                      <span className="tabular-nums" style={{ color: bonus ? 'var(--nm-text-body)' : 'var(--nm-text-faint)' }}>
                        {bonus ? `$${fmt(bonus.amount_twd)}${bonus.memo ? ` · ${bonus.memo}` : ''}` : '—'}
                      </span>
                      <BonusButton userId={u.id} month={month} currentAmount={bonus?.amount_twd ?? 0} currentMemo={bonus?.memo ?? null} />
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top text-right tabular-nums whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>
                    {reimbursement ? `$${fmt(reimbursement.total)}(${reimbursement.count} 筆)` : '—'}
                  </td>
                  <td className="px-3 py-2 align-top text-right tabular-nums font-semibold whitespace-nowrap" style={{ color: 'var(--nm-text-body)' }}>
                    {subtotal > 0 ? `$${fmt(subtotal)}` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!hasAnything && (
        <p className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>本月沒有任何薪資/獎金/代墊,無法鎖定。</p>
      )}

      <div className="flex flex-wrap gap-3 items-center">
        <LockPayrollButton month={month} disabled={blocked || !hasAnything} skippedNames={skippedNames} />
        <a href={`/api/boss/close/${month}/export.csv`} className="nm-btn text-[13px]">匯出零用金 CSV</a>
      </div>

      <p className="text-[12px]" style={{ color: 'var(--nm-text-faint)' }}>
        {LEDGER_KIND_LABEL.salary}/{LEDGER_KIND_LABEL.bonus}/{LEDGER_KIND_LABEL.reimbursement}鎖定後會各自寫成一筆帳務分錄,可在「全部」模式查到。
      </p>
    </div>
  );
}
