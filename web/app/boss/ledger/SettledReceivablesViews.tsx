import Link from 'next/link';
import {
  LEDGER_KIND_LABEL,
  INVOICE_STATUS_LABEL,
  type LedgerEntry,
  type LedgerKind,
  type InvoiceStatus,
  type ReceivableDirection,
} from '@/lib/types';
import { summarizeEntries } from '@/lib/ledger-summary';
import { fetchReceivablesWithRemaining, summarizeReceivables, type ReceivableSummaryRow } from '@/lib/receivables-query';
import { getSupabaseAdmin } from '@/lib/supabase';
import { VoidDialog } from './VoidDialog';
import LedgerRowMobile from './LedgerRowMobile';
import ReceivableForm from './receivables/ReceivableForm';
import StatusButtons from './receivables/StatusButtons';
import ReceivableRowMobile from './receivables/ReceivableRowMobile';
import { buildHref, fmt, monthRange, NO_SITE, type SP } from './ledger-page-helpers';

// 收支兩欄的列表面板統一用這個高度——固定尺寸、內部捲動,篩選/切月份時版面不跳動。
// 「已收付」/「應收應付」這兩個模式沿用原本的表格檢視,不在這輪 handoff 範圍內
// (handoff 01 只重畫 mode=all 的帳務首頁,見 AllView.tsx)。
const LIST_PANEL_HEIGHT = 560;

export async function SettledView({
  sb, month, siteId, kind, invoice, toCheckOnly, ext, showVoided, base,
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
  type Row = LedgerEntry & { sites?: { name: string } | null };
  const rows: Row[] = (data ?? []) as Row[];
  const incomeRows = rows.filter((r) => r.direction === 'income');
  const expenseRows = rows.filter((r) => r.direction === 'expense');
  const { income, expense, net, extIncome, extTax, feeTotal } = summarizeEntries(rows);

  if (error) {
    return (
      <div className="rounded-2xl px-4 py-3 text-[13px]" style={{ background: 'rgba(224,122,122,0.08)', border: '1px solid rgba(224,122,122,0.34)', color: 'var(--nm-danger-glass-text)' }}>
        讀取失敗,以下數字不可信:{error.message}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard label="收入合計" value={`$${fmt(income)}`} tone="income" />
        <SummaryCard label="支出合計" value={`$${fmt(expense)}`} tone="expense" />
        <SummaryCard label="淨額(已扣手續費)" value={`$${fmt(net)}`} tone={net >= 0 ? 'income' : 'expense'} />
        <div className="rounded-2xl nm-raised-sm p-3 text-[13px]">
          <div style={{ color: 'var(--nm-text-secondary)' }}>外帳彙總</div>
          <div className="mt-1" style={{ color: 'var(--nm-text-body)' }}>收入 <span className="font-semibold">${fmt(extIncome)}</span> · 稅額 <span className="font-semibold">${fmt(extTax)}</span></div>
        </div>
        <div className="rounded-2xl nm-raised-sm p-3 text-[13px]">
          <div style={{ color: 'var(--nm-text-secondary)' }}>手續費合計</div>
          <div className="mt-1 text-lg font-semibold" style={{ color: 'var(--nm-text-body)' }}>${fmt(feeTotal)}</div>
        </div>
      </div>

      {showVoided && (
        <div className="rounded-xl px-3 py-2 text-[13px]" style={{ background: 'rgba(217,181,107,0.09)', border: '1px solid rgba(217,181,107,0.3)', color: 'var(--nm-warning-glass-text)' }}>
          目前顯示已作廢帳目(不計入合計)。<Link href={buildHref(base, { show_voided: undefined })} className="underline ml-1">返回作用中</Link>
        </div>
      )}
      {!showVoided && (
        <div className="text-right">
          <Link href={buildHref(base, { show_voided: '1' })} className="text-[13px] underline" style={{ color: 'var(--nm-text-muted)' }}>顯示已作廢</Link>
        </div>
      )}

      <EntrySection title="收入" rows={incomeRows} tone="income" />
      <EntrySection title="支出" rows={expenseRows} tone="expense" />
    </div>
  );
}

function EntrySection({ title, rows, tone }: { title: string; rows: Array<LedgerEntry & { sites?: { name: string } | null }>; tone: 'income' | 'expense' }) {
  const toneColor = tone === 'income' ? 'var(--nm-success-glass-text)' : 'var(--nm-danger-glass-text)';
  return (
    <div className="space-y-2">
      <div className="text-[13px] font-semibold" style={{ color: toneColor }}>{title} · {rows.length} 筆</div>

      {/* 手機:卡片流,固定高度、內部捲動 */}
      <div className="lg:hidden flex flex-col gap-3 overflow-y-auto pr-1" style={{ height: LIST_PANEL_HEIGHT }}>
        {rows.length === 0 && <p className="text-[13px] text-center py-4" style={{ color: 'var(--nm-text-secondary)' }}>沒有紀錄</p>}
        {rows.map((r) => <LedgerRowMobile key={r.id} row={r} />)}
      </div>

      {/* 桌機:表格,固定高度、內部捲動 */}
      <div className="hidden lg:block rounded-2xl nm-raised overflow-x-auto overflow-y-auto" style={{ height: LIST_PANEL_HEIGHT }}>
        <table className="w-full text-[13px]" style={{ minWidth: 1000, borderCollapse: 'collapse' }}>
          <thead style={{ background: 'rgba(20,20,24,0.92)' }}>
            <tr style={{ color: 'var(--nm-text-muted)' }}>
              <th className="text-left px-3 py-2 font-normal whitespace-nowrap">日期</th>
              <th className="text-left px-3 py-2 font-normal whitespace-nowrap">分類</th>
              <th className="text-left px-3 py-2 font-normal whitespace-nowrap">對象</th>
              <th className="text-left px-3 py-2 font-normal whitespace-nowrap">歸屬</th>
              <th className="text-right px-3 py-2 font-normal whitespace-nowrap">金額</th>
              <th className="text-left px-3 py-2 font-normal whitespace-nowrap">發票</th>
              <th className="text-left px-3 py-2 font-normal whitespace-nowrap">備註</th>
              <th className="text-left px-3 py-2 font-normal whitespace-nowrap">動作</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>沒有紀錄</td></tr>
            )}
            {rows.map((r) => {
              const voided = r.state === 'voided';
              return (
                <tr key={r.id} style={{ borderTop: '1px solid var(--nm-border-hair)', opacity: voided ? 0.5 : 1 }}>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>{r.occurred_on}</td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--nm-text-body)' }}>
                    {LEDGER_KIND_LABEL[r.kind]}
                    {r.source_batch_id && <span className="nm-pill nm-pill-muted ml-2">薪資結算匯入</span>}
                    {r.to_check && <span className="nm-pill nm-pill-warning ml-2">待確認</span>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>{r.party ?? '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>
                    {r.sites?.name ?? <span style={{ color: 'var(--nm-text-faint)' }}>專案外</span>}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono tabular whitespace-nowrap ${voided ? 'line-through' : ''}`} style={{ color: 'var(--nm-text-body)' }}>${fmt(r.amount_twd)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.invoice_status === 'none' && <span style={{ color: 'var(--nm-text-secondary)' }}>—</span>}
                    {r.invoice_status === 'to_issue' && <span className="nm-pill nm-pill-warning">{INVOICE_STATUS_LABEL.to_issue}</span>}
                    {r.invoice_status === 'issued' && (
                      <span className="nm-pill" style={{ color: 'var(--nm-success-glass-text)', background: 'rgba(126,207,157,0.1)', borderColor: 'rgba(126,207,157,0.28)' }}>
                        {INVOICE_STATUS_LABEL.issued}{r.invoice_date && <span className="ml-1" style={{ color: 'var(--nm-text-muted)' }}>{r.invoice_date}</span>}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 max-w-[14rem]">
                    <div className="truncate" title={r.memo ?? ''} style={{ color: 'var(--nm-text-secondary)' }}>{r.memo ?? ''}</div>
                    {voided && r.voided_reason && <div className="text-xs whitespace-nowrap" style={{ color: 'var(--nm-text-muted)' }}>作廢原因:{r.voided_reason}</div>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {!voided && (
                      <div className="flex gap-2 items-center">
                        <Link href={`/boss/ledger/${r.id}`} className="underline" style={{ color: 'var(--nm-text-secondary)' }}>編輯</Link>
                        <VoidDialog id={r.id} summary={`${r.occurred_on} · ${LEDGER_KIND_LABEL[r.kind]} · ${r.party ?? '—'} · $${fmt(r.amount_twd)}`} />
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export async function ReceivablesView({
  sb, direction, siteId,
}: {
  sb: ReturnType<typeof getSupabaseAdmin>;
  direction: ReceivableDirection;
  siteId?: string;
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

  return (
    <div className="space-y-4">
      <div className="rounded-2xl nm-raised-sm p-3 text-[13px] max-w-xs">
        <div style={{ color: 'var(--nm-text-secondary)' }}>尚未{direction === 'receivable' ? '收到' : '付出'}</div>
        <div className="text-lg font-semibold mt-1" style={{ color: direction === 'receivable' ? 'var(--nm-success-glass-text)' : 'var(--nm-danger-glass-text)' }}>${fmt(total)}</div>
      </div>

      {/* 手機:卡片流,固定高度、內部捲動 */}
      <div className="lg:hidden flex flex-col gap-3 overflow-y-auto pr-1" style={{ height: LIST_PANEL_HEIGHT }}>
        {rows.length === 0 && <p className="text-[13px] text-center py-6" style={{ color: 'var(--nm-text-secondary)' }}>沒有紀錄</p>}
        {rows.map((r) => <ReceivableRowMobile key={r.id} row={r} />)}
      </div>

      {/* 桌機:表格,固定高度、內部捲動 */}
      <div className="hidden lg:block rounded-2xl nm-raised overflow-x-auto overflow-y-auto" style={{ height: LIST_PANEL_HEIGHT }}>
        <table className="w-full text-[13px]" style={{ minWidth: 900, borderCollapse: 'collapse' }}>
          <thead style={{ background: 'rgba(20,20,24,0.92)' }}>
            <tr style={{ color: 'var(--nm-text-muted)' }}>
              <th className="text-left px-3 py-2 font-normal whitespace-nowrap">對象</th>
              <th className="text-left px-3 py-2 font-normal whitespace-nowrap">歸屬</th>
              <th className="text-right px-3 py-2 font-normal whitespace-nowrap">約定總額</th>
              <th className="text-right px-3 py-2 font-normal whitespace-nowrap">已結</th>
              <th className="text-right px-3 py-2 font-normal whitespace-nowrap">未結</th>
              <th className="text-left px-3 py-2 font-normal whitespace-nowrap">狀態</th>
              <th className="text-left px-3 py-2 font-normal whitespace-nowrap">動作</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>沒有紀錄</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} style={{ borderTop: '1px solid var(--nm-border-hair)' }}>
                <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--nm-text-body)' }}>{r.party}</td>
                <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>{r.sites?.name ?? '專案外'}</td>
                <td className="px-3 py-2 text-right font-mono tabular whitespace-nowrap" style={{ color: 'var(--nm-text-body)' }}>${fmt(r.total_amount_twd)}</td>
                <td className="px-3 py-2 text-right font-mono tabular whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>${fmt(r.settled_twd)}</td>
                <td className="px-3 py-2 text-right font-mono tabular whitespace-nowrap" style={{ color: r.overpaid ? 'var(--nm-danger-glass-text)' : 'var(--nm-text-body)' }}>
                  {r.overpaid ? `超收 $${fmt(Math.abs(r.remaining_twd))}` : `$${fmt(r.remaining_twd)}`}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.status === 'open' && <span className="nm-pill nm-pill-warning">未結</span>}
                  {r.status === 'closed' && <span className="nm-pill" style={{ color: 'var(--nm-success-glass-text)', background: 'rgba(126,207,157,0.1)', borderColor: 'rgba(126,207,157,0.28)' }}>已結清</span>}
                  {r.status === 'voided' && <span className="nm-pill nm-pill-muted line-through">已作廢</span>}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <StatusButtons id={r.id} status={r.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ReceivableForm />
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: 'income' | 'expense' }) {
  const color = tone === 'income' ? 'var(--nm-success-glass-text)' : 'var(--nm-danger-glass-text)';
  return (
    <div className="rounded-2xl nm-raised-sm p-3">
      <div className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>{label}</div>
      <div className="text-2xl font-semibold mt-1" style={{ color }}>{value}</div>
    </div>
  );
}
