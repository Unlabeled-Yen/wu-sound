import Link from 'next/link';
import {
  type LedgerKind,
  type InvoiceStatus,
  type ReceivableDirection,
} from '@/lib/types';
import { summarizeEntries } from '@/lib/ledger-summary';
import { fetchReceivablesWithRemaining, summarizeReceivables, type ReceivableSummaryRow } from '@/lib/receivables-query';
import { getSupabaseAdmin } from '@/lib/supabase';
import ReceivableForm from './receivables/ReceivableForm';
import StatusButtons from './receivables/StatusButtons';
import EditDueDateButton from './receivables/EditDueDateButton';
import ExportCsvDialog from './ExportCsvDialog';
import { LedgerFilterBar } from './LedgerFilterBar';
import { SettledMonthList, type SettledEntry } from './SettledMonthList';
import { IncomeExpenseTabs } from './IncomeExpenseTabs';
import { buildHref, currentMonth, fmt, monthRange, shiftMonth, NO_SITE, type SP } from './ledger-page-helpers';

// 「已收付」分頁——v3 把原本帳務首頁(儀表板)下半部的月份明細併進來,不重畫
// 兩份幾乎一樣的列表。這裡自己管月份/篩選/合計/清單,不依賴頁面頂層的
// mode 分支(分頁現在是滑動切換、不導頁,頂層的 server-computed 區塊沒辦法
// 跟著切換而更新,所有跟「這個分頁長什麼樣」有關的東西都要自帶)。
export async function SettledView({
  sb, month, siteId, kind, invoice, toCheckOnly, ext, showVoided, base, sites,
}: {
  sb: ReturnType<typeof getSupabaseAdmin>;
  month: string;
  siteId?: string;
  kind?: LedgerKind;
  invoice?: InvoiceStatus;
  toCheckOnly: boolean;
  ext?: string;
  showVoided: boolean;
  base: SP;
  sites: Array<{ id: string; name: string }>;
}) {
  let q = sb.from('ledger_entries').select('*, sites(name)').eq('state', showVoided ? 'voided' : 'posted');
  if (month !== 'all') {
    const { from, to } = monthRange(month);
    q = q.gte('occurred_on', from).lte('occurred_on', to);
  }
  if (siteId === NO_SITE) q = q.is('site_id', null);
  else if (siteId) q = q.eq('site_id', siteId);
  if (kind) q = q.eq('kind', kind);
  if (invoice) q = q.eq('invoice_status', invoice);
  if (toCheckOnly) q = q.eq('to_check', true);
  if (ext === 'internal') q = q.eq('is_external', false);
  else if (ext === 'external') q = q.eq('is_external', true);
  q = q.order('occurred_on', { ascending: false }).order('created_at', { ascending: false });

  const { data, error } = await q;

  if (error) {
    return (
      <div className="rounded-2xl px-4 py-3 text-[13px]" style={{ background: 'rgba(224,122,122,0.08)', border: '1px solid rgba(224,122,122,0.34)', color: 'var(--nm-danger-glass-text)' }}>
        讀取失敗,以下數字不可信:{error.message}
      </div>
    );
  }

  const rows: SettledEntry[] = (data ?? []) as SettledEntry[];
  const listIncome = rows.filter((r) => r.direction === 'income');
  const listExpense = rows.filter((r) => r.direction === 'expense');
  const { income, expense, net, extIncome, extTax, feeTotal } = summarizeEntries(rows);
  const monthLabel = month === 'all' ? '不限月份' : month;

  return (
    <div className="space-y-4 lg:h-full lg:flex lg:flex-col lg:min-h-0">
      <div className="shrink-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[15px] font-semibold" style={{ color: 'var(--nm-text-primary)' }}>本月已收付明細</div>
            <div className="text-[12px] mt-0.5" style={{ color: 'var(--nm-text-muted)' }}>{monthLabel}　·　只含已收付分錄,未結約定請看應收款／應付款</div>
          </div>
          <div className="flex items-center gap-2 text-[13px]">
            <Link href={buildHref(base, { month: shiftMonth(month === 'all' ? currentMonth() : month, -1) })} className="nm-btn" style={{ padding: '4px 10px', minHeight: 'auto' }}>← 上月</Link>
            <span className="font-semibold min-w-[6rem] text-center" style={{ color: 'var(--nm-text-primary)' }}>{monthLabel}</span>
            <Link href={buildHref(base, { month: shiftMonth(month === 'all' ? currentMonth() : month, 1) })} className="nm-btn" style={{ padding: '4px 10px', minHeight: 'auto' }}>下月 →</Link>
            {month !== currentMonth() && (
              <Link href={buildHref(base, { month: currentMonth() })} className="underline" style={{ color: 'var(--nm-text-muted)', padding: '4px 8px' }}>回本月</Link>
            )}
          </div>
        </div>

        <div className="rounded-2xl nm-raised-sm px-4 py-3 text-[13px] flex flex-wrap items-center gap-x-2 gap-y-1">
          <span style={{ color: 'var(--nm-success-glass-text)' }}>收入 ${fmt(income)}</span>
          <span style={{ color: 'var(--nm-text-faint)' }}>·</span>
          <span style={{ color: 'var(--nm-danger-glass-text)' }}>支出 ${fmt(expense)}</span>
          <span style={{ color: 'var(--nm-text-faint)' }}>·</span>
          <span style={{ color: net >= 0 ? 'var(--nm-success-glass-text)' : 'var(--nm-danger-glass-text)' }}>淨額(已扣手續費) {net >= 0 ? '+' : ''}${fmt(net)}</span>
          <span style={{ color: 'var(--nm-text-faint)' }}>·</span>
          <span style={{ color: 'var(--nm-text-secondary)' }}>外帳 收入 ${fmt(extIncome)}／稅額 ${fmt(extTax)}</span>
        </div>

        <LedgerFilterBar mode="settled" month={month} siteId={siteId} kind={kind} invoice={invoice} ext={ext} sites={sites} base={base} showKindInvoiceExt />

        {toCheckOnly && (
          <div className="rounded-xl px-3 py-2 text-[13px] flex items-center gap-2" style={{ background: 'rgba(217,181,107,0.09)', border: '1px solid rgba(217,181,107,0.3)', color: 'var(--nm-warning-glass-text)' }}>
            篩選中:只顯示「AI 沒把握 / 待確認」的帳目
            <Link href={buildHref(base, { to_check: undefined })} className="underline ml-auto" style={{ color: 'var(--nm-text-muted)' }}>清除</Link>
          </div>
        )}

        {showVoided ? (
          <div className="rounded-xl px-3 py-2 text-[13px]" style={{ background: 'rgba(217,181,107,0.09)', border: '1px solid rgba(217,181,107,0.3)', color: 'var(--nm-warning-glass-text)' }}>
            目前顯示已作廢帳目(不計入合計)。<Link href={buildHref(base, { show_voided: undefined })} className="underline ml-1">返回作用中</Link>
          </div>
        ) : (
          <div className="text-right">
            <Link href={buildHref(base, { show_voided: '1' })} className="text-[13px] underline" style={{ color: 'var(--nm-text-muted)' }}>顯示已作廢</Link>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0">
        <div className="hidden lg:grid grid-cols-2 gap-4 h-full">
          <SettledMonthList title="收入" tone="income" items={listIncome} columnTotal={income} />
          <SettledMonthList title="支出" tone="expense" items={listExpense} columnTotal={expense} />
        </div>
        <IncomeExpenseTabs
          income={<SettledMonthList title="收入" tone="income" items={listIncome} columnTotal={income} />}
          expense={<SettledMonthList title="支出" tone="expense" items={listExpense} columnTotal={expense} />}
        />
      </div>

      <div className="shrink-0 pt-1">
        <ExportCsvDialog defaultMonth={month === 'all' ? currentMonth() : month} />
      </div>
    </div>
  );
}

export async function ReceivablesView({
  sb, direction, siteId, sites, base, month,
}: {
  sb: ReturnType<typeof getSupabaseAdmin>;
  direction: ReceivableDirection;
  siteId?: string;
  sites: Array<{ id: string; name: string }>;
  base: SP;
  month: string;
}) {
  // 應收/應付永遠不受月份篩選——這是「現在還欠多少」的餘額,不是某段期間發生的流水。
  const { rows: allRows, error } = await fetchReceivablesWithRemaining(sb, { direction });
  const rows = siteId
    ? (siteId === NO_SITE ? allRows.filter((r) => !r.site_id) : allRows.filter((r) => r.site_id === siteId))
    : allRows;
  const openRows = rows.filter((r) => r.status === 'open');
  const { receivableOpenTotal, payableOpenTotal } = summarizeReceivables(openRows as ReceivableSummaryRow[]);
  const total = direction === 'receivable' ? receivableOpenTotal : payableOpenTotal;

  if (error) {
    return (
      <div className="rounded-2xl px-4 py-3 text-[13px]" style={{ background: 'rgba(224,122,122,0.08)', border: '1px solid rgba(224,122,122,0.34)', color: 'var(--nm-danger-glass-text)' }}>
        讀取失敗,以下數字不可信:{error}
      </div>
    );
  }

  const unsettledLabel = direction === 'receivable' ? '未收' : '未付';
  const settledLabel = direction === 'receivable' ? '已收' : '已付';
  const mode = direction === 'receivable' ? 'receivable' : 'payable';

  return (
    <div className="space-y-4 lg:h-full lg:overflow-y-auto lg:pr-1">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="rounded-2xl nm-raised-sm p-3 text-[13px] max-w-xs">
          <div style={{ color: 'var(--nm-text-secondary)' }}>尚未{direction === 'receivable' ? '收到' : '付出'}</div>
          <div className="text-lg font-semibold mt-1" style={{ color: direction === 'receivable' ? 'var(--nm-success-glass-text)' : 'var(--nm-danger-glass-text)' }}>${fmt(total)}</div>
        </div>
        <LedgerFilterBar mode={mode} month={month} siteId={siteId} sites={sites} base={base} showKindInvoiceExt={false} />
      </div>

      {rows.length === 0 && <p className="text-[13px] text-center py-6" style={{ color: 'var(--nm-text-secondary)' }}>沒有紀錄</p>}

      {/* 卡片形狀＝第二編碼:未結(open)＝空心黃框(不分收入/支出方向),
          已結(closed)＝實心底卡走方向色,作廢＝灰底刪除線——與帳務首頁的
          幾何編碼規則一致(見 SettledMonthList.tsx)。 */}

      {/* 桌機:扁平列,左側 3px 色條 */}
      <div className="hidden lg:flex flex-col">
        {rows.map((r) => {
          const voided = r.status === 'voided';
          const closed = r.status === 'closed';
          const barColor = closed ? (direction === 'receivable' ? 'var(--nm-success)' : 'var(--nm-danger)') : voided ? 'var(--nm-text-faint)' : 'var(--nm-warning)';
          const amountColor = r.overpaid ? 'var(--nm-danger-glass-text)' : closed ? (direction === 'receivable' ? 'var(--nm-success-glass-text)' : 'var(--nm-danger-glass-text)') : 'var(--nm-warning-glass-text)';
          const meta = [
            r.sites?.name ?? '專案外',
            `約定 $${fmt(r.total_amount_twd)}`,
            r.settled_twd > 0 ? `${settledLabel} $${fmt(r.settled_twd)}` : null,
            !closed && !voided ? (r.agreed_due_date ? `約定日 ${r.agreed_due_date}` : '未排定日期') : null,
          ].filter(Boolean).join(' · ');
          return (
            <div key={r.id} className="flex items-center gap-3 py-[18px]" style={{ borderBottom: '1px solid var(--nm-border-hair)', opacity: voided ? 0.5 : 1 }}>
              <span className="shrink-0" style={{ width: 3, height: 34, background: barColor, borderRadius: 2 }} />
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-medium truncate" style={{ color: 'var(--nm-text-body)' }}>{r.party}</div>
                <div className="text-xs mt-1" style={{ color: 'var(--nm-text-muted)' }}>{meta}</div>
              </div>
              <span className={`text-[16px] font-semibold tabular-nums shrink-0 ${voided ? 'line-through' : ''}`} style={{ color: amountColor }}>
                {r.overpaid ? `超收 $${fmt(Math.abs(r.remaining_twd))}` : `$${fmt(r.remaining_twd)}`}
              </span>
              <span className="shrink-0">
                {r.status === 'open' && <span className="nm-pill nm-pill-warning">{unsettledLabel}</span>}
                {closed && <span className="nm-pill" style={{ color: 'var(--nm-success-glass-text)', background: 'rgba(126,207,157,0.1)', borderColor: 'rgba(126,207,157,0.28)' }}>已結清</span>}
                {voided && <span className="nm-pill nm-pill-muted line-through">已作廢</span>}
              </span>
              <div className="shrink-0 flex items-center gap-2">
                {!voided && <EditDueDateButton id={r.id} agreedDueDate={r.agreed_due_date} />}
                <StatusButtons id={r.id} status={r.status} remainingTwd={r.remaining_twd} direction={direction} />
              </div>
            </div>
          );
        })}
      </div>

      {/* 手機:卡片流——open 用空心描邊卡,closed/voided 用實心卡 */}
      <div className="lg:hidden flex flex-col gap-2">
        {rows.map((r) => {
          const voided = r.status === 'voided';
          const closed = r.status === 'closed';
          const open = r.status === 'open';
          const amountColor = r.overpaid ? 'var(--nm-danger-glass-text)' : closed ? (direction === 'receivable' ? 'var(--nm-success-glass-text)' : 'var(--nm-danger-glass-text)') : 'var(--nm-warning-glass-text)';
          const cardClass = open ? 'rounded-2xl p-3.5 flex flex-col gap-2' : 'nm-raised rounded-2xl p-3.5 flex flex-col gap-2';
          const cardStyle = open ? { border: '1.5px solid var(--nm-warning)', background: 'transparent' } : { opacity: voided ? 0.5 : 1 };
          return (
            <div key={r.id} className={cardClass} style={cardStyle}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[14px] font-medium truncate" style={{ color: 'var(--nm-text-body)' }}>{r.party}</span>
                <span className={`text-[16px] font-semibold tabular-nums ${voided ? 'line-through' : ''}`} style={{ color: amountColor }}>
                  {r.overpaid ? `超收 $${fmt(Math.abs(r.remaining_twd))}` : `$${fmt(r.remaining_twd)}`}
                </span>
              </div>
              <div className="text-xs flex flex-wrap gap-x-2 gap-y-1" style={{ color: 'var(--nm-text-secondary)' }}>
                {r.sites?.name ? <span>{r.sites.name}</span> : <span style={{ color: 'var(--nm-text-faint)' }}>專案外</span>}
                <span>約定 ${fmt(r.total_amount_twd)}</span>
                {open && <span>{r.agreed_due_date ? `約定日 ${r.agreed_due_date}` : '未排定日期'}</span>}
              </div>
              <div className="flex items-center justify-between pt-0.5">
                {open && <span className="nm-pill nm-pill-warning">{unsettledLabel}</span>}
                {closed && <span className="nm-pill" style={{ color: 'var(--nm-success-glass-text)', background: 'rgba(126,207,157,0.1)', borderColor: 'rgba(126,207,157,0.28)' }}>已結清</span>}
                {voided && <span className="nm-pill nm-pill-muted line-through">已作廢</span>}
                <StatusButtons id={r.id} status={r.status} remainingTwd={r.remaining_twd} direction={direction} />
              </div>
              {!voided && (
                <div className="pt-1" style={{ borderTop: '1px solid var(--nm-border-hair)' }}>
                  <EditDueDateButton id={r.id} agreedDueDate={r.agreed_due_date} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <ReceivableForm />
    </div>
  );
}
