import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { PayProfile, PayrollBonus } from '@/lib/types';
import { resolveMonthlySalary } from '@/lib/payroll';
import PayProfileButton from './payroll/PayProfileButton';
import BonusButton from './payroll/BonusButton';
import SettlePayrollButton from './payroll/SettlePayrollButton';
import { buildHref, currentMonth, fmt, shiftMonth, type SP } from './ledger-page-helpers';

interface UserRow { id: string; name: string; active: boolean }
interface ExpenseRow { id: string; user_id: string; amount_twd: number | null; status: string; spent_on: string | null; captured_at: string; booked_batch_id: string | null }

function monthOf(spentOn: string | null, capturedAt: string): string {
  return (spentOn ?? capturedAt).slice(0, 7);
}

// 月結:薪資(固定月薪)+獎金+代墊零用金的處理中心,不是一次性鎖定。人員表
// 永遠可編輯——送出結算後改任何一項,存檔當下就自動同步對應的帳務分錄
// (見 lib/payroll-sync-server.ts)。「已結算」只代表 book_batches 有沒有這個月
// 的紀錄,不代表資料唯讀。見 docs/payroll-pettycash-merge-spec.md。
export async function PayrollView({ sb, month, base }: { sb: ReturnType<typeof getSupabaseAdmin>; month: string; base: SP }) {
  const batchMonth = `${month}-01`;
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const monthEndDate = `${month}-${String(lastDay).padStart(2, '0')}`;

  const [batchRes, usersRes, profilesRes, bonusesRes, expensesRes] = await Promise.all([
    sb.from('book_batches').select('id, created_at').eq('month', batchMonth).maybeSingle(),
    sb.from('users').select('id, name, active').eq('active', true).order('name'),
    sb.from('user_pay_profiles').select('*').lte('effective_from', monthEndDate).order('effective_from', { ascending: false }),
    sb.from('payroll_bonuses').select('*').eq('batch_month', batchMonth),
    sb.from('expenses').select('id, user_id, amount_twd, status, spent_on, captured_at, booked_batch_id').in('status', ['draft', 'submitted', 'confirmed', 'booked']),
  ]);
  if (batchRes.error || usersRes.error || profilesRes.error || bonusesRes.error || expensesRes.error) {
    return (
      <div className="rounded-2xl px-4 py-3 text-[13px]" style={{ background: 'rgba(224,122,122,0.08)', border: '1px solid rgba(224,122,122,0.34)', color: 'var(--nm-danger-glass-text)' }}>
        讀取失敗,以下數字不可信:{batchRes.error?.message ?? usersRes.error?.message ?? profilesRes.error?.message ?? bonusesRes.error?.message ?? expensesRes.error?.message}
      </div>
    );
  }
  const batch = batchRes.data;
  const users = (usersRes.data ?? []) as UserRow[];
  const profiles = (profilesRes.data ?? []) as PayProfile[];
  const bonuses = (bonusesRes.data ?? []) as PayrollBonus[];
  const allExpenses = ((expensesRes.data ?? []) as ExpenseRow[]).filter((r) => monthOf(r.spent_on, r.captured_at) === month);
  const pending = allExpenses.filter((r) => r.status === 'draft' || r.status === 'submitted');
  // 已確認但還沒併過(confirmed),或上次同步已併進「這一批」的(booked 且 booked_batch_id
  // 對得上)——跟 syncPayrollMonth 用同一套規則,人員表才會跟送出結算後寫進帳務的數字一致。
  const counted = allExpenses.filter((r) => r.status === 'confirmed' || (r.status === 'booked' && r.booked_batch_id === batch?.id));

  const reimbursementByUser = new Map<string, { total: number; count: number }>();
  for (const r of counted) {
    const cur = reimbursementByUser.get(r.user_id) ?? { total: 0, count: 0 };
    cur.total += r.amount_twd ?? 0;
    cur.count += 1;
    reimbursementByUser.set(r.user_id, cur);
  }
  const bonusByUser = new Map<string, PayrollBonus>();
  for (const b of bonuses) bonusByUser.set(b.user_id, b);

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
  const grandTotal = grandSalary + grandBonus + grandReimbursement;

  return (
    <div className="space-y-4 lg:h-full lg:overflow-y-auto lg:pr-1">
      <div className="flex items-center justify-end gap-2 text-[13px]">
        <Link href={buildHref(base, { mode: 'payroll', month: shiftMonth(month, -1) })} className="nm-btn" style={{ padding: '4px 10px', minHeight: 'auto' }}>← 上月</Link>
        <span className="font-semibold min-w-[6rem] text-center" style={{ color: 'var(--nm-text-primary)' }}>{month}</span>
        <Link href={buildHref(base, { mode: 'payroll', month: shiftMonth(month, 1) })} className="nm-btn" style={{ padding: '4px 10px', minHeight: 'auto' }}>下月 →</Link>
        {month !== currentMonth() && (
          <Link href={buildHref(base, { mode: 'payroll', month: currentMonth() })} className="underline" style={{ color: 'var(--nm-text-muted)', padding: '4px 8px' }}>回本月</Link>
        )}
      </div>
      {batch ? (
        <div className="rounded-2xl px-4 py-3 text-[13px] flex items-center gap-2" style={{ background: 'rgba(126,207,157,0.08)', border: '1px solid rgba(126,207,157,0.26)', color: 'var(--nm-success-glass-text)' }}>
          {month} 已結算 · 帳目日期 {month}-10 · 合計 ${fmt(grandTotal)} · 改動會自動連動帳務
        </div>
      ) : (
        <div className="rounded-2xl px-4 py-3 text-[13px]" style={{ background: 'rgba(20,20,24,0.5)', border: '1px solid var(--nm-border-hair)', color: 'var(--nm-text-secondary)' }}>
          {month} 尚未結算
        </div>
      )}

      {pending.length > 0 && (
        <div className="rounded-2xl px-5 py-4 text-[13px]" style={{ background: 'rgba(217,181,107,0.08)', border: '1px solid rgba(217,181,107,0.28)', color: 'var(--nm-warning-glass-text)' }}>
          尚有 {pending.length} 筆零用金未審核,審核通過後會自動併入這個月的代墊金額——不擋結算。
          到 <Link href="/boss/expenses" className="underline font-semibold">零用金審核</Link> 處理。
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
                      <PayProfileButton userId={u.id} currentSalary={salary} month={month} />
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
        <p className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>本月沒有任何薪資/獎金/代墊,無法結算。</p>
      )}

      <div className="flex flex-wrap gap-3 items-center">
        <SettlePayrollButton month={month} settled={!!batch} disabled={!hasAnything} skippedNames={skippedNames} />
        <a href={`/api/boss/close/${month}/export.csv`} className="nm-btn text-[13px]">匯出零用金 CSV</a>
        {batch && (
          <Link href={`/boss/ledger?mode=all&month=${month}`} className="text-[13px] underline" style={{ color: 'var(--nm-text-muted)' }}>到「全部」模式看這批分錄</Link>
        )}
      </div>

      <p className="text-[12px]" style={{ color: 'var(--nm-text-faint)' }}>
        送出結算後,薪資/獎金/代墊各自寫成一筆帳務分錄(帳目日期=當月 10 號發薪日),之後在這裡改任何數字都會自動同步,不用重新送出。
      </p>
    </div>
  );
}
