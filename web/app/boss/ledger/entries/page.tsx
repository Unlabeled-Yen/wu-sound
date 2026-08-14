import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/supabase';
import {
  LEDGER_KIND_LABEL,
  LEDGER_JOURNAL_LABEL,
  INVOICE_STATUS_LABEL,
  INCOME_KINDS,
  EXPENSE_KINDS,
  JOURNAL_KINDS,
  type LedgerEntry,
  type LedgerKind,
  type LedgerDirection,
  type LedgerStatus,
  type LedgerJournal,
} from '@/lib/types';
import { summarizeEntries } from '@/lib/ledger-summary';
import ImportBatchDialog from '../ImportBatchDialog';
import ExportCsvDialog from '../ExportCsvDialog';
import { VoidDialog } from '../VoidDialog';
import LedgerRowMobile from '../LedgerRowMobile';
import { taipeiCurrentMonthStr } from '@/lib/tz';

export const dynamic = 'force-dynamic';

function currentMonth(): string {
  return taipeiCurrentMonthStr();
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const from = `${y}-${String(m).padStart(2, '0')}-01`;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const to = `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  return { from, to };
}

interface SP {
  month?: string;
  filter?: string;
  direction?: string;
  kind?: string;
  status?: string;
  site_id?: string;
  journal?: string;
  to_check?: string;
}

function buildHref(base: SP, overrides: Partial<SP>): string {
  const p = new URLSearchParams();
  const merged: SP = { ...base, ...overrides };
  if (merged.month) p.set('month', merged.month);
  if (merged.filter && merged.filter !== 'all') p.set('filter', merged.filter);
  if (merged.direction) p.set('direction', merged.direction);
  if (merged.kind) p.set('kind', merged.kind);
  if (merged.status && merged.status !== 'active') p.set('status', merged.status);
  if (merged.site_id) p.set('site_id', merged.site_id);
  if (merged.journal) p.set('journal', merged.journal);
  if (merged.to_check === '1') p.set('to_check', '1');
  const q = p.toString();
  return q ? `/boss/ledger/entries?${q}` : '/boss/ledger/entries';
}

export default async function LedgerEntriesPage(
  { searchParams }: { searchParams: Promise<SP> },
) {
  const sp = (await searchParams) ?? {};
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : currentMonth();
  const filter = (sp.filter as 'all' | 'internal' | 'external') ?? 'all';
  const direction = (sp.direction as LedgerDirection | undefined);
  const kind = (sp.kind as LedgerKind | undefined);
  const statusVal: LedgerStatus = sp.status === 'voided' ? 'voided' : 'active';
  const siteId = sp.site_id;
  const journal = sp.journal && sp.journal in JOURNAL_KINDS ? (sp.journal as LedgerJournal) : undefined;
  const toCheckOnly = sp.to_check === '1';

  const { from, to } = monthRange(month);
  const sb = getSupabaseAdmin();

  // 明細表與摘要卡共用同一組篩選條件——F2 修的就是這裡:摘要卡以前只套月份,
  // 篩選帳簿/方向/類別/案場時,卡片數字跟表格對不上。兩條查詢分開寫(supabase-js
  // 的 query builder 型別鏈很難乾淨地抽成共用函式),但篩選條件逐行對照,改一邊
  // 要記得改另一邊——這正是 F15 把「算法」抽成純函式、而非「查詢」抽成共用函式的原因:
  // summarizeEntries 才是真正共用的部分,篩選條件本來就得各自套用到各自的 select。

  let listQ = sb
    .from('ledger_entries')
    .select('*, sites(name)')
    .gte('occurred_on', from)
    .lte('occurred_on', to)
    .eq('status', statusVal);
  if (filter === 'internal') listQ = listQ.eq('is_external', false);
  if (filter === 'external') listQ = listQ.eq('is_external', true);
  if (direction === 'income' || direction === 'expense') listQ = listQ.eq('direction', direction);
  if (kind) listQ = listQ.eq('kind', kind);
  if (siteId) listQ = listQ.eq('site_id', siteId);
  if (journal) listQ = listQ.eq('journal', journal);
  if (toCheckOnly) listQ = listQ.eq('to_check', true);
  listQ = listQ.order('occurred_on', { ascending: true }).order('created_at', { ascending: true });
  const { data, error } = await listQ;
  type LedgerRowWithSite = LedgerEntry & { sites?: { name: string } | null };
  const rows: LedgerRowWithSite[] = (data ?? []) as LedgerRowWithSite[];
  const siteName = siteId ? (rows.find((r) => r.site_id === siteId)?.sites?.name ?? null) : null;

  // 摘要卡合計:同一組篩選條件,只是 status 固定 active(voided 不列入合計,
  // 不論列表現在顯示的是作用中還是已作廢)。
  let sumQ = sb
    .from('ledger_entries')
    .select('direction, amount_twd, fee_twd, is_external, tax_amount_twd')
    .gte('occurred_on', from)
    .lte('occurred_on', to)
    .eq('status', 'active');
  if (filter === 'internal') sumQ = sumQ.eq('is_external', false);
  if (filter === 'external') sumQ = sumQ.eq('is_external', true);
  if (direction === 'income' || direction === 'expense') sumQ = sumQ.eq('direction', direction);
  if (kind) sumQ = sumQ.eq('kind', kind);
  if (siteId) sumQ = sumQ.eq('site_id', siteId);
  if (journal) sumQ = sumQ.eq('journal', journal);
  if (toCheckOnly) sumQ = sumQ.eq('to_check', true);
  const sumRes = await sumQ;
  const { income, expense, net, extIncome, extTax, feeTotal } = summarizeEntries(sumRes.data ?? []);

  const kindOptions = direction === 'income' ? INCOME_KINDS
    : direction === 'expense' ? EXPENSE_KINDS
    : [...INCOME_KINDS, ...EXPENSE_KINDS];

  const fmt = (n: number) => n.toLocaleString('zh-TW');
  const filtered = Boolean(filter !== 'all' || direction || kind || siteId || journal || toCheckOnly);

  const base: SP = { month, filter, direction, kind, status: statusVal, site_id: siteId, journal, to_check: toCheckOnly ? '1' : undefined };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-semibold" style={{ color: 'var(--nm-text-primary)' }}>帳目明細</h1>
        <Link href="/boss/ledger" className="text-[13px] underline" style={{ color: 'var(--nm-text-muted)' }}>← 回帳簿看板</Link>
      </div>

      {journal && (
        <div
          className="rounded-xl px-3 py-2 text-[13px] flex items-center gap-2"
          style={{ background: 'rgba(126,207,157,0.08)', border: '1px solid rgba(126,207,157,0.26)', color: 'var(--nm-success-glass-text)' }}
        >
          篩選中:「{LEDGER_JOURNAL_LABEL[journal]}」帳簿
          <Link href={buildHref(base, { journal: undefined })} className="underline ml-auto" style={{ color: 'var(--nm-text-muted)' }}>清除篩選</Link>
        </div>
      )}

      {toCheckOnly && (
        <div
          className="rounded-xl px-3 py-2 text-[13px] flex items-center gap-2"
          style={{ background: 'rgba(217,181,107,0.09)', border: '1px solid rgba(217,181,107,0.3)', color: 'var(--nm-warning-glass-text)' }}
        >
          篩選中:只顯示「AI 沒把握 / 待確認」的帳目
          <Link href={buildHref(base, { to_check: undefined })} className="underline ml-auto" style={{ color: 'var(--nm-text-muted)' }}>清除篩選</Link>
        </div>
      )}

      {/* 頂部:月份 + 篩選 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-[13px]">
          <Link
            href={buildHref(base, { month: shiftMonth(month, -1) })}
            className="nm-btn"
            style={{ padding: '4px 10px', minHeight: 'auto' }}
          >← 上月</Link>
          <span className="font-semibold min-w-[6rem] text-center" style={{ color: 'var(--nm-text-primary)' }}>{month}</span>
          <Link
            href={buildHref(base, { month: shiftMonth(month, 1) })}
            className="nm-btn"
            style={{ padding: '4px 10px', minHeight: 'auto' }}
          >下月 →</Link>
          <Link
            href={buildHref(base, { month: currentMonth() })}
            className="underline"
            style={{ color: 'var(--nm-text-muted)', padding: '4px 8px' }}
          >回本月</Link>
        </div>

        <div className="flex gap-1 text-[13px]">
          {(['all', 'internal', 'external'] as const).map((f) => (
            <Link
              key={f}
              href={buildHref(base, { filter: f })}
              className={filter === f ? 'nm-btn-solid' : 'nm-btn'}
              style={{ borderRadius: 999, padding: '4px 14px', minHeight: 'auto' }}
            >{f === 'all' ? '全部' : f === 'internal' ? '內帳' : '外帳'}</Link>
          ))}
        </div>

        <form action="/boss/ledger/entries" method="get" className="flex items-center gap-2 text-[13px]">
          <input type="hidden" name="month" value={month} />
          <input type="hidden" name="filter" value={filter} />
          {statusVal !== 'active' && <input type="hidden" name="status" value={statusVal} />}
          {journal && <input type="hidden" name="journal" value={journal} />}
          <select
            name="direction"
            defaultValue={direction ?? ''}
            className="nm-input"
            style={{ width: 'auto', minHeight: 34, padding: '4px 10px' }}
          >
            <option value="">方向:全部</option>
            <option value="income">收入</option>
            <option value="expense">支出</option>
          </select>
          <select
            name="kind"
            defaultValue={kind ?? ''}
            className="nm-input"
            style={{ width: 'auto', minHeight: 34, padding: '4px 10px' }}
          >
            <option value="">類別:全部</option>
            {kindOptions.map((k) => (
              <option key={k} value={k}>{LEDGER_KIND_LABEL[k]}</option>
            ))}
          </select>
          <button
            type="submit"
            className="nm-btn"
            style={{ padding: '4px 14px', minHeight: 'auto' }}
          >套用</button>
        </form>

        <Link
          href={buildHref(base, { status: statusVal === 'active' ? 'voided' : 'active' })}
          className="text-[13px] underline ml-auto"
          style={{ color: 'var(--nm-text-muted)' }}
        >
          {statusVal === 'active' ? '顯示已作廢' : '返回作用中'}
        </Link>
      </div>

      {siteId && (
        <div
          className="rounded-xl px-3 py-2 text-[13px] flex items-center gap-2"
          style={{ background: 'rgba(126,207,157,0.08)', border: '1px solid rgba(126,207,157,0.26)', color: 'var(--nm-success-glass-text)' }}
        >
          篩選中:{siteName ? `專案「${siteName}」` : '此專案本月無資料'}
          <Link href={buildHref(base, { site_id: undefined })} className="underline ml-auto" style={{ color: 'var(--nm-text-muted)' }}>清除篩選</Link>
        </div>
      )}

      {/* 摘要卡:跟明細表套用同一組篩選,標籤隨篩選狀態變化,不會跟表格數字對不上 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard label={`收入合計${filtered ? '(篩選後)' : ''}`} value={`$${fmt(income)}`} tone="income" />
        <SummaryCard label={`支出合計${filtered ? '(篩選後)' : ''}`} value={`$${fmt(expense)}`} tone="expense" />
        <SummaryCard label={`淨額(已扣手續費)${filtered ? '(篩選後)' : ''}`} value={`$${fmt(net)}`} tone={net >= 0 ? 'income' : 'expense'} />
        <div className="rounded-2xl nm-raised-sm p-3 text-[13px]">
          <div style={{ color: 'var(--nm-text-secondary)' }}>外帳彙總{filtered ? '(篩選後)' : ''}</div>
          <div className="mt-1" style={{ color: 'var(--nm-text-body)' }}>收入合計 <span className="font-semibold">${fmt(extIncome)}</span></div>
          <div style={{ color: 'var(--nm-text-body)' }}>稅額合計 <span className="font-semibold">${fmt(extTax)}</span></div>
        </div>
        <div className="rounded-2xl nm-raised-sm p-3 text-[13px]">
          <div style={{ color: 'var(--nm-text-secondary)' }}>轉帳手續費合計{filtered ? '(篩選後)' : ''}</div>
          <div className="mt-1 text-lg font-semibold" style={{ color: 'var(--nm-text-body)' }}>${fmt(feeTotal)}</div>
        </div>
      </div>

      {/* 手機:卡片流 */}
      <div className="lg:hidden flex flex-col gap-3">
        {error && (
          <p className="text-[13px]" style={{ color: 'var(--nm-danger)' }}>查詢失敗: {error.message}</p>
        )}
        {!error && rows.length === 0 && (
          <p className="text-[13px] text-center py-6" style={{ color: 'var(--nm-text-secondary)' }}>本月沒有紀錄</p>
        )}
        {rows.map((r) => <LedgerRowMobile key={r.id} row={r} />)}
      </div>

      {/* 桌機:表格 */}
      <div className="hidden lg:block rounded-2xl nm-raised overflow-x-auto overflow-y-auto">
        <table className="w-full text-[13px]" style={{ minWidth: 1100, borderCollapse: 'collapse' }}>
          <thead style={{ background: 'rgba(20,20,24,0.92)' }}>
            <tr style={{ color: 'var(--nm-text-muted)' }}>
              <th className="text-left px-3 py-2 font-normal whitespace-nowrap">日期</th>
              <th className="text-left px-3 py-2 font-normal whitespace-nowrap">方向</th>
              <th className="text-left px-3 py-2 font-normal whitespace-nowrap">類別</th>
              <th className="text-left px-3 py-2 font-normal whitespace-nowrap">對象</th>
              <th className="text-left px-3 py-2 font-normal whitespace-nowrap">案場</th>
              <th className="text-right px-3 py-2 font-normal whitespace-nowrap">金額</th>
              <th className="text-left px-3 py-2 font-normal whitespace-nowrap">內外帳</th>
              <th className="text-left px-3 py-2 font-normal whitespace-nowrap">發票</th>
              <th className="text-left px-3 py-2 font-normal whitespace-nowrap">備註</th>
              <th className="text-left px-3 py-2 font-normal whitespace-nowrap">動作</th>
            </tr>
          </thead>
          <tbody>
            {error && (
              <tr><td colSpan={10} className="px-3 py-4 whitespace-nowrap" style={{ color: 'var(--nm-danger)' }}>查詢失敗: {error.message}</td></tr>
            )}
            {!error && rows.length === 0 && (
              <tr><td colSpan={10} className="px-3 py-6 text-center whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>本月沒有紀錄</td></tr>
            )}
            {rows.map((r) => {
              const voided = r.status === 'voided';
              return (
                <tr
                  key={r.id}
                  style={{ borderTop: '1px solid var(--nm-border-hair)', opacity: voided ? 0.5 : 1 }}
                >
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>{r.occurred_on}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.direction === 'income'
                      ? <span style={{ color: 'var(--nm-success-glass-text)' }}>↑ 收</span>
                      : <span style={{ color: 'var(--nm-danger-glass-text)' }}>↓ 支</span>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--nm-text-body)' }}>
                    {LEDGER_KIND_LABEL[r.kind]}
                    {r.source_batch_id && (
                      <span className="nm-pill nm-pill-muted ml-2">薪資結算匯入</span>
                    )}
                    {r.to_check && (
                      <span className="nm-pill nm-pill-warning ml-2">待確認</span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>{r.party ?? '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>
                    {r.sites?.name ?? <span style={{ color: 'var(--nm-text-faint)' }}>—</span>}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono tabular whitespace-nowrap ${voided ? 'line-through' : ''}`} style={{ color: 'var(--nm-text-body)' }}>
                    ${fmt(r.amount_twd)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={`nm-pill ${r.is_external ? 'nm-pill-neutral' : 'nm-pill-muted'}`}>{r.is_external ? '外帳' : '內帳'}</span>
                    {r.is_external && r.tax_amount_twd > 0 && (
                      <span className="ml-1 text-xs" style={{ color: 'var(--nm-text-muted)' }}>稅 ${fmt(r.tax_amount_twd)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.invoice_status === 'none' && <span style={{ color: 'var(--nm-text-secondary)' }}>—</span>}
                    {r.invoice_status === 'to_issue' && (
                      <span className="nm-pill nm-pill-warning">
                        {INVOICE_STATUS_LABEL.to_issue}
                      </span>
                    )}
                    {r.invoice_status === 'issued' && (
                      <span className="nm-pill" style={{ color: 'var(--nm-success-glass-text)', background: 'rgba(126,207,157,0.1)', borderColor: 'rgba(126,207,157,0.28)' }}>
                        {INVOICE_STATUS_LABEL.issued}
                        {r.invoice_date && <span className="ml-1" style={{ color: 'var(--nm-text-muted)' }}>{r.invoice_date}</span>}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 max-w-[16rem]">
                    <div className="truncate" title={r.memo ?? ''} style={{ color: 'var(--nm-text-secondary)' }}>{r.memo ?? ''}</div>
                    {voided && r.voided_reason && (
                      <div className="text-xs whitespace-nowrap" style={{ color: 'var(--nm-text-muted)' }}>作廢原因:{r.voided_reason}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {!voided && (
                      <div className="flex gap-2 items-center">
                        <Link
                          href={`/boss/ledger/${r.id}`}
                          className="underline"
                          style={{ color: 'var(--nm-text-secondary)' }}
                        >編輯</Link>
                        <VoidDialog
                          id={r.id}
                          summary={`${r.occurred_on} · ${LEDGER_KIND_LABEL[r.kind]} · ${r.party ?? '—'} · $${fmt(r.amount_twd)}`}
                        />
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 底部按鈕列 */}
      <div className="flex flex-wrap gap-3 items-center pt-2">
        <Link
          href={`/boss/ledger/new?month=${month}`}
          className="nm-btn-solid text-[13px]"
        >新增一筆</Link>
        <ImportBatchDialog />
        <ExportCsvDialog defaultMonth={month} />
        <Link href="/boss/ledger/receivables" className="nm-btn text-[13px]">應收應付</Link>
        <Link href="/boss/ledger/invoices" className="nm-btn text-[13px]">待開發票</Link>
        <Link href="/boss/report" className="nm-btn text-[13px]">報表中心</Link>
      </div>
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
