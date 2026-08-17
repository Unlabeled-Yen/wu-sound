import Link from 'next/link';
import { LEDGER_KIND_LABEL, type LedgerEntry, type LedgerKind } from '@/lib/types';
import { getSupabaseAdmin } from '@/lib/supabase';
import { PrintButton } from './PrintButton';
import {
  buildHref, currentMonth, currentQuarter, currentYear, fmt,
  reportPeriodRange, shiftMonth, shiftQuarter, type ReportPeriodType, type SP,
} from './ledger-page-helpers';

// 報表中心——基礎版:先給老闆看月/季/年的正式損益表、能列印/存 PDF。
// 外帳給會計的資料報表是下一輪要細部討論的東西,這版先不做,見底部說明文字。
export async function ReportsView({ sb, base, rp, rv }: {
  sb: ReturnType<typeof getSupabaseAdmin>;
  base: SP;
  rp: ReportPeriodType;
  rv: string;
}) {
  const { from, to, label } = reportPeriodRange(rp, rv);

  const { data, error } = await sb
    .from('ledger_entries')
    .select('kind, direction, amount_twd')
    .eq('state', 'posted')
    .gte('occurred_on', from)
    .lte('occurred_on', to);

  if (error) {
    return (
      <div className="rounded-2xl px-4 py-3 text-[13px]" style={{ background: 'rgba(224,122,122,0.08)', border: '1px solid rgba(224,122,122,0.34)', color: 'var(--nm-danger-glass-text)' }}>
        讀取失敗,以下數字不可信:{error.message}
      </div>
    );
  }

  const rows = (data ?? []) as Array<Pick<LedgerEntry, 'kind' | 'direction' | 'amount_twd'>>;
  const incomeByKind = new Map<LedgerKind, number>();
  const expenseByKind = new Map<LedgerKind, number>();
  let totalIncome = 0, totalExpense = 0;
  for (const r of rows) {
    const map = r.direction === 'income' ? incomeByKind : expenseByKind;
    map.set(r.kind, (map.get(r.kind) ?? 0) + r.amount_twd);
    if (r.direction === 'income') totalIncome += r.amount_twd;
    else totalExpense += r.amount_twd;
  }
  const net = totalIncome - totalExpense;
  const incomeRows = Array.from(incomeByKind.entries()).sort((a, b) => b[1] - a[1]);
  const expenseRows = Array.from(expenseByKind.entries()).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-4 lg:h-full lg:overflow-y-auto lg:pr-1">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <PeriodTypeSwitch base={base} rp={rp} />
        <PeriodNav base={base} rp={rp} rv={rv} />
      </div>

      <div className="report-print-area rounded-2xl nm-raised p-6 lg:p-8" style={{ maxWidth: 640 }}>
        <div className="text-center mb-6">
          <div className="text-[18px] font-semibold" style={{ color: 'var(--nm-text-primary)' }}>損益表</div>
          <div className="text-[13px] mt-1" style={{ color: 'var(--nm-text-secondary)' }}>{label}</div>
        </div>

        <ReportSection title="收入" rows={incomeRows} total={totalIncome} tone="income" />
        <ReportSection title="支出" rows={expenseRows} total={totalExpense} tone="expense" />

        <div className="flex items-center justify-between pt-4 mt-4" style={{ borderTop: '2px solid var(--nm-text-primary)' }}>
          <span className="text-[15px] font-semibold" style={{ color: 'var(--nm-text-primary)' }}>本期損益</span>
          <span className="text-[18px] font-bold tabular-nums" style={{ color: net >= 0 ? 'var(--nm-success-glass-text)' : 'var(--nm-danger-glass-text)' }}>
            {net >= 0 ? '+' : ''}${fmt(net)}
          </span>
        </div>
      </div>

      <div className="no-print flex flex-wrap gap-3 items-center">
        <PrintButton />
        <span className="text-[12px]" style={{ color: 'var(--nm-text-faint)' }}>
          基礎版:先看月/季/年損益,外帳給會計的資料報表之後再細部討論。
        </span>
      </div>
    </div>
  );
}

function ReportSection({ title, rows, total, tone }: {
  title: string;
  rows: Array<[LedgerKind, number]>;
  total: number;
  tone: 'income' | 'expense';
}) {
  const toneColor = tone === 'income' ? 'var(--nm-success-glass-text)' : 'var(--nm-danger-glass-text)';
  return (
    <div className="mb-5">
      <div className="text-[13px] font-semibold mb-2" style={{ color: toneColor }}>{title}</div>
      {rows.length === 0 && <div className="text-[13px] py-2" style={{ color: 'var(--nm-text-faint)' }}>這段期間沒有{title}紀錄</div>}
      {rows.map(([kind, amount]) => (
        <div key={kind} className="flex items-center justify-between py-1.5 text-[13.5px]" style={{ borderBottom: '1px solid var(--nm-border-hair)', color: 'var(--nm-text-body)' }}>
          <span>{LEDGER_KIND_LABEL[kind]}</span>
          <span className="tabular-nums">${fmt(amount)}</span>
        </div>
      ))}
      <div className="flex items-center justify-between pt-2 text-[14px] font-semibold" style={{ color: 'var(--nm-text-primary)' }}>
        <span>{title}合計</span>
        <span className="tabular-nums">${fmt(total)}</span>
      </div>
    </div>
  );
}

function PeriodTypeSwitch({ base, rp }: { base: SP; rp: ReportPeriodType }) {
  const options: Array<[ReportPeriodType, string]> = [['month', '月'], ['quarter', '季'], ['year', '年']];
  return (
    <div className="nm-inset flex gap-1.5 text-[13px]" style={{ borderRadius: 999, padding: 4, color: 'var(--nm-text-secondary)' }}>
      {options.map(([type, optLabel]) => (
        <Link
          key={type}
          href={buildHref(base, { rp: type, rv: type === 'month' ? currentMonth() : type === 'quarter' ? currentQuarter() : currentYear() })}
          style={
            rp === type
              ? { borderRadius: 999, padding: '6px 14px', background: '#f0f0f2', color: '#17171a', fontWeight: 500 }
              : { borderRadius: 999, padding: '6px 14px' }
          }
        >{optLabel}</Link>
      ))}
    </div>
  );
}

function PeriodNav({ base, rp, rv }: { base: SP; rp: ReportPeriodType; rv: string }) {
  const prev = rp === 'year' ? String(Number(rv) - 1) : rp === 'quarter' ? shiftQuarter(rv, -1) : shiftMonth(rv, -1);
  const next = rp === 'year' ? String(Number(rv) + 1) : rp === 'quarter' ? shiftQuarter(rv, 1) : shiftMonth(rv, 1);
  const cur = rp === 'year' ? currentYear() : rp === 'quarter' ? currentQuarter() : currentMonth();
  return (
    <div className="flex items-center gap-2 text-[13px]">
      <Link href={buildHref(base, { rv: prev })} className="nm-btn" style={{ padding: '4px 10px', minHeight: 'auto' }}>← 上期</Link>
      <span className="font-semibold min-w-[7rem] text-center" style={{ color: 'var(--nm-text-primary)' }}>{rv}</span>
      <Link href={buildHref(base, { rv: next })} className="nm-btn" style={{ padding: '4px 10px', minHeight: 'auto' }}>下期 →</Link>
      {rv !== cur && (
        <Link href={buildHref(base, { rv: cur })} className="underline" style={{ color: 'var(--nm-text-muted)', padding: '4px 8px' }}>回本期</Link>
      )}
    </div>
  );
}
