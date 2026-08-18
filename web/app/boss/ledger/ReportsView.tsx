import Link from 'next/link';
import { type LedgerEntry } from '@/lib/types';
import { getSupabaseAdmin } from '@/lib/supabase';
import { buildIncomeStatement, type ReportEntryRow, type KindAmount } from '@/lib/ledger-report-summary';
import { PrintButton } from './PrintButton';
import {
  buildHref, currentMonth, currentQuarter, currentYear, fmt,
  reportPeriodRange, shiftMonth, shiftQuarter, type ReportPeriodType, type SP,
} from './ledger-page-helpers';

// 報表中心——A 批:口徑止血。淨額/營業收入分類全部委派 lib/ledger-report-summary.ts,
// 這裡不再自行 reduce(R-RPT2)。版面本身待設計端提案(見
// docs/reports-center-shape-brief-v1.md),這版只保證數字對,不重排結構。
export async function ReportsView({ sb, base, rp, rv }: {
  sb: ReturnType<typeof getSupabaseAdmin>;
  base: SP;
  rp: ReportPeriodType;
  rv: string;
}) {
  const { from, to, label } = reportPeriodRange(rp, rv);

  const { data, error } = await sb
    .from('ledger_entries')
    .select('kind, direction, amount_twd, fee_twd')
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

  const rows = (data ?? []) as Array<Pick<LedgerEntry, 'kind' | 'direction' | 'amount_twd' | 'fee_twd'>> as ReportEntryRow[];
  const stmt = buildIncomeStatement(rows);

  return (
    <div className="space-y-4 lg:h-full lg:overflow-y-auto lg:pr-1">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <PeriodTypeSwitch base={base} rp={rp} />
        <PeriodNav base={base} rp={rp} rv={rv} />
      </div>

      <div className="report-print-area rounded-2xl nm-raised p-6 lg:p-8" style={{ maxWidth: 640 }}>
        <div className="text-center mb-2">
          <div className="text-[18px] font-semibold" style={{ color: 'var(--nm-text-primary)' }}>損益表</div>
          <div className="text-[13px] mt-1" style={{ color: 'var(--nm-text-secondary)' }}>{label}</div>
        </div>
        <div className="text-center text-[11.5px] mb-6" style={{ color: 'var(--nm-text-faint)' }}>
          單位:新台幣元 · 現金收付制 · 已扣轉帳手續費 · 不含未收未付款 · 不含人力分攤成本
        </div>

        <ReportSection title="營業收入" rows={stmt.operatingIncomeRows} total={stmt.operatingIncomeTotal} tone="income" emptyLabel="這段期間沒有營業收入紀錄" />
        <ReportSection title="營業支出" rows={stmt.operatingExpenseRows} total={stmt.operatingExpenseTotal} tone="expense" emptyLabel="這段期間沒有營業支出紀錄" />

        <div className="flex items-center justify-between py-1.5 text-[13.5px]" style={{ borderBottom: '1px solid var(--nm-border-hair)', color: 'var(--nm-text-body)' }}>
          <span>轉帳手續費</span>
          <span className="tabular-nums">${fmt(stmt.feeTotal)}</span>
        </div>

        <div className="flex items-center justify-between pt-3 mt-2 mb-6" style={{ borderTop: '1px solid var(--nm-text-primary)' }}>
          <span className="text-[14.5px] font-semibold" style={{ color: 'var(--nm-text-primary)' }}>營業損益</span>
          <span className="text-[16px] font-bold tabular-nums" style={{ color: stmt.operatingNet >= 0 ? 'var(--nm-success-glass-text)' : 'var(--nm-danger-glass-text)' }}>
            {stmt.operatingNet >= 0 ? '+' : ''}${fmt(stmt.operatingNet)}
          </span>
        </div>

        {(stmt.nonOperatingIncomeRows.length > 0 || stmt.nonOperatingExpenseRows.length > 0) && (
          <div className="mb-5">
            <div className="text-[13px] font-semibold mb-2" style={{ color: 'var(--nm-text-secondary)' }}>營業外及個人項</div>
            <div className="text-[11.5px] mb-2" style={{ color: 'var(--nm-text-faint)' }}>
              借款/資本、投資、健檢——不是本業經營結果,不計入營業損益(R-RPT1)
            </div>
            {stmt.nonOperatingIncomeRows.map((r) => (
              <div key={r.kind} className="flex items-center justify-between py-1.5 text-[13.5px]" style={{ borderBottom: '1px solid var(--nm-border-hair)', color: 'var(--nm-text-body)' }}>
                <span>{r.label}</span>
                <span className="tabular-nums">+${fmt(r.amount)}</span>
              </div>
            ))}
            {stmt.nonOperatingExpenseRows.map((r) => (
              <div key={r.kind} className="flex items-center justify-between py-1.5 text-[13.5px]" style={{ borderBottom: '1px solid var(--nm-border-hair)', color: 'var(--nm-text-body)' }}>
                <span>{r.label}</span>
                <span className="tabular-nums">-${fmt(r.amount)}</span>
              </div>
            ))}
          </div>
        )}

        {stmt.retiredRows.length > 0 && (
          <div className="mb-5">
            <div className="text-[13px] font-semibold mb-2" style={{ color: 'var(--nm-text-faint)' }}>已退役類別(歷史資料)</div>
            <div className="text-[11.5px] mb-2" style={{ color: 'var(--nm-text-faint)' }}>
              「信用卡」自 v3 起不再是可選類別,以下是遷移前的舊分錄,仍計入本期淨額(R-RPT4)
            </div>
            {stmt.retiredRows.map((r) => (
              <div key={r.kind} className="flex items-center justify-between py-1.5 text-[13.5px]" style={{ borderBottom: '1px solid var(--nm-border-hair)', color: 'var(--nm-text-faint)' }}>
                <span>{r.label}</span>
                <span className="tabular-nums">-${fmt(r.amount)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-4 mt-4" style={{ borderTop: '2px solid var(--nm-text-primary)' }}>
          <span className="text-[15px] font-semibold" style={{ color: 'var(--nm-text-primary)' }}>本期淨額</span>
          <span className="text-[18px] font-bold tabular-nums" style={{ color: stmt.net >= 0 ? 'var(--nm-success-glass-text)' : 'var(--nm-danger-glass-text)' }}>
            {stmt.net >= 0 ? '+' : ''}${fmt(stmt.net)}
          </span>
        </div>
      </div>

      <div className="no-print flex flex-wrap gap-3 items-center">
        <PrintButton />
        <span className="text-[12px]" style={{ color: 'var(--nm-text-faint)' }}>
          基礎版:營業損益已排除借款/投資/健檢、已扣手續費。多維度(專案/稅務/零用金)報表下一輪加入。
        </span>
      </div>
    </div>
  );
}

function ReportSection({ title, rows, total, tone, emptyLabel }: {
  title: string;
  rows: KindAmount[];
  total: number;
  tone: 'income' | 'expense';
  emptyLabel: string;
}) {
  const toneColor = tone === 'income' ? 'var(--nm-success-glass-text)' : 'var(--nm-danger-glass-text)';
  return (
    <div className="mb-5">
      <div className="text-[13px] font-semibold mb-2" style={{ color: toneColor }}>{title}</div>
      {rows.length === 0 && <div className="text-[13px] py-2" style={{ color: 'var(--nm-text-faint)' }}>{emptyLabel}</div>}
      {rows.map((r) => (
        <div key={r.kind} className="flex items-center justify-between py-1.5 text-[13.5px]" style={{ borderBottom: '1px solid var(--nm-border-hair)', color: 'var(--nm-text-body)' }}>
          <span>{r.label}</span>
          <span className="tabular-nums">${fmt(r.amount)}</span>
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
