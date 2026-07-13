import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/supabase';
import {
  LEDGER_KIND_LABEL,
  INVOICE_STATUS_LABEL,
  INCOME_KINDS,
  EXPENSE_KINDS,
  type LedgerEntry,
  type LedgerKind,
  type LedgerDirection,
  type LedgerStatus,
} from '@/lib/types';
import { voidEntryForm } from './actions';
import ImportBatchDialog from './ImportBatchDialog';
import ExportCsvDialog from './ExportCsvDialog';

export const dynamic = 'force-dynamic';

function currentMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
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
}

function buildHref(base: SP, overrides: Partial<SP>): string {
  const p = new URLSearchParams();
  const merged: SP = { ...base, ...overrides };
  if (merged.month) p.set('month', merged.month);
  if (merged.filter && merged.filter !== 'all') p.set('filter', merged.filter);
  if (merged.direction) p.set('direction', merged.direction);
  if (merged.kind) p.set('kind', merged.kind);
  if (merged.status && merged.status !== 'active') p.set('status', merged.status);
  const q = p.toString();
  return q ? `/boss/ledger?${q}` : '/boss/ledger';
}

export default async function LedgerPage(
  { searchParams }: { searchParams: Promise<SP> },
) {
  const sp = (await searchParams) ?? {};
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : currentMonth();
  const filter = (sp.filter as 'all' | 'internal' | 'external') ?? 'all';
  const direction = (sp.direction as LedgerDirection | undefined);
  const kind = (sp.kind as LedgerKind | undefined);
  const statusVal: LedgerStatus = sp.status === 'voided' ? 'voided' : 'active';

  const { from, to } = monthRange(month);
  const sb = getSupabaseAdmin();

  let q = sb
    .from('ledger_entries')
    .select('*')
    .gte('occurred_on', from)
    .lte('occurred_on', to)
    .eq('status', statusVal);
  if (filter === 'internal') q = q.eq('is_external', false);
  if (filter === 'external') q = q.eq('is_external', true);
  if (direction === 'income' || direction === 'expense') q = q.eq('direction', direction);
  if (kind) q = q.eq('kind', kind);
  q = q.order('occurred_on', { ascending: true }).order('created_at', { ascending: true });
  const { data, error } = await q;
  const rows: LedgerEntry[] = (data ?? []) as LedgerEntry[];

  // 合計(只算 active,不論 filter 顯示 voided 或否,摘要都以 active 為準)
  const sumQ = await sb
    .from('ledger_entries')
    .select('direction, amount_twd, is_external, tax_amount_twd')
    .gte('occurred_on', from)
    .lte('occurred_on', to)
    .eq('status', 'active');
  const sums = (sumQ.data ?? []) as Array<Pick<LedgerEntry, 'direction' | 'amount_twd' | 'is_external' | 'tax_amount_twd'>>;
  let income = 0, expense = 0, extIncome = 0, extTax = 0;
  for (const r of sums) {
    if (r.direction === 'income') income += r.amount_twd;
    else expense += r.amount_twd;
    if (r.is_external) {
      if (r.direction === 'income') extIncome += r.amount_twd;
      extTax += r.tax_amount_twd;
    }
  }
  const net = income - expense;

  const kindOptions = direction === 'income' ? INCOME_KINDS
    : direction === 'expense' ? EXPENSE_KINDS
    : [...INCOME_KINDS, ...EXPENSE_KINDS];

  const fmt = (n: number) => n.toLocaleString('zh-TW');

  const base: SP = { month, filter, direction, kind, status: statusVal };

  return (
    <div className="space-y-4">
      {/* 頂部:月份 + 篩選 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm">
          <Link
            href={buildHref(base, { month: shiftMonth(month, -1) })}
            className="px-2 py-1 border border-neutral-300 dark:border-neutral-700 rounded"
          >← 上月</Link>
          <span className="font-semibold min-w-[6rem] text-center">{month}</span>
          <Link
            href={buildHref(base, { month: shiftMonth(month, 1) })}
            className="px-2 py-1 border border-neutral-300 dark:border-neutral-700 rounded"
          >下月 →</Link>
          <Link
            href={buildHref(base, { month: currentMonth() })}
            className="px-2 py-1 text-neutral-500 underline"
          >回本月</Link>
        </div>

        <div className="flex gap-1 text-sm">
          {(['all', 'internal', 'external'] as const).map((f) => (
            <Link
              key={f}
              href={buildHref(base, { filter: f })}
              className={`px-3 py-1 rounded-full border ${
                filter === f
                  ? 'bg-neutral-900 text-white border-neutral-900 dark:bg-neutral-100 dark:text-neutral-900'
                  : 'border-neutral-300 dark:border-neutral-700'
              }`}
            >{f === 'all' ? '全部' : f === 'internal' ? '內帳' : '外帳'}</Link>
          ))}
        </div>

        <form action="/boss/ledger" method="get" className="flex items-center gap-2 text-sm">
          <input type="hidden" name="month" value={month} />
          <input type="hidden" name="filter" value={filter} />
          {statusVal !== 'active' && <input type="hidden" name="status" value={statusVal} />}
          <select
            name="direction"
            defaultValue={direction ?? ''}
            className="border border-neutral-300 dark:border-neutral-700 rounded px-2 py-1 bg-white dark:bg-neutral-900"
          >
            <option value="">方向:全部</option>
            <option value="income">收入</option>
            <option value="expense">支出</option>
          </select>
          <select
            name="kind"
            defaultValue={kind ?? ''}
            className="border border-neutral-300 dark:border-neutral-700 rounded px-2 py-1 bg-white dark:bg-neutral-900"
          >
            <option value="">類別:全部</option>
            {kindOptions.map((k) => (
              <option key={k} value={k}>{LEDGER_KIND_LABEL[k]}</option>
            ))}
          </select>
          <button
            type="submit"
            className="px-3 py-1 border border-neutral-300 dark:border-neutral-700 rounded"
          >套用</button>
        </form>

        <Link
          href={buildHref(base, { status: statusVal === 'active' ? 'voided' : 'active' })}
          className="text-sm text-neutral-500 underline ml-auto"
        >
          {statusVal === 'active' ? '顯示已作廢' : '返回作用中'}
        </Link>
      </div>

      {/* 摘要卡 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard label="當月收入合計" value={`$${fmt(income)}`} tone="income" />
        <SummaryCard label="當月支出合計" value={`$${fmt(expense)}`} tone="expense" />
        <SummaryCard label="淨額" value={`$${fmt(net)}`} tone={net >= 0 ? 'income' : 'expense'} />
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 text-sm">
          <div className="text-neutral-500">外帳彙總</div>
          <div className="mt-1">收入合計 <span className="font-semibold">${fmt(extIncome)}</span></div>
          <div>稅額合計 <span className="font-semibold">${fmt(extTax)}</span></div>
        </div>
      </div>

      {/* 表格 */}
      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-x-auto bg-white dark:bg-neutral-900">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-950 text-neutral-500">
            <tr>
              <th className="text-left px-3 py-2">日期</th>
              <th className="text-left px-3 py-2">方向</th>
              <th className="text-left px-3 py-2">類別</th>
              <th className="text-left px-3 py-2">對象</th>
              <th className="text-right px-3 py-2">金額</th>
              <th className="text-left px-3 py-2">內外帳</th>
              <th className="text-left px-3 py-2">發票</th>
              <th className="text-left px-3 py-2">備註</th>
              <th className="text-left px-3 py-2">動作</th>
            </tr>
          </thead>
          <tbody>
            {error && (
              <tr><td colSpan={9} className="px-3 py-4 text-red-600">查詢失敗: {error.message}</td></tr>
            )}
            {!error && rows.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-neutral-500">本月沒有紀錄</td></tr>
            )}
            {rows.map((r) => {
              const voided = r.status === 'voided';
              return (
                <tr key={r.id} className={`border-t border-neutral-100 dark:border-neutral-800 ${voided ? 'opacity-50' : ''}`}>
                  <td className="px-3 py-2 whitespace-nowrap">{r.occurred_on}</td>
                  <td className="px-3 py-2">
                    {r.direction === 'income'
                      ? <span className="text-emerald-600">↑ 收</span>
                      : <span className="text-rose-600">↓ 支</span>}
                  </td>
                  <td className="px-3 py-2">
                    {LEDGER_KIND_LABEL[r.kind]}
                    {r.source_batch_id && (
                      <span className="ml-2 inline-block text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 text-white">零用金月結</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{r.party ?? '—'}</td>
                  <td className={`px-3 py-2 text-right font-mono ${voided ? 'line-through' : ''}`}>
                    ${fmt(r.amount_twd)}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${
                      r.is_external
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200'
                        : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
                    }`}>{r.is_external ? '外帳' : '內帳'}</span>
                    {r.is_external && r.tax_amount_twd > 0 && (
                      <span className="ml-1 text-xs text-neutral-500">稅 ${fmt(r.tax_amount_twd)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {r.invoice_status === 'none' && '—'}
                    {r.invoice_status === 'to_issue' && (
                      <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200">
                        {INVOICE_STATUS_LABEL.to_issue}
                      </span>
                    )}
                    {r.invoice_status === 'issued' && (
                      <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                        {INVOICE_STATUS_LABEL.issued}
                        {r.invoice_date && <span className="ml-1 text-neutral-500">{r.invoice_date}</span>}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 max-w-[16rem]">
                    <div className="truncate" title={r.memo ?? ''}>{r.memo ?? ''}</div>
                    {voided && r.voided_reason && (
                      <div className="text-xs text-neutral-500">作廢原因:{r.voided_reason}</div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {!voided && (
                      <div className="flex gap-2 items-center">
                        <Link
                          href={`/boss/ledger/${r.id}`}
                          className="text-blue-600 dark:text-blue-400 underline"
                        >編輯</Link>
                        <form action={voidEntryForm}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="reason" value="" />
                          <button
                            type="submit"
                            className="text-rose-600 dark:text-rose-400 underline"
                          >作廢</button>
                        </form>
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
          className="px-4 py-2 rounded bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
        >新增一筆</Link>
        <ImportBatchDialog />
        <ExportCsvDialog defaultMonth={month} />
      </div>
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: 'income' | 'expense' }) {
  const color = tone === 'income'
    ? 'text-emerald-700 dark:text-emerald-300'
    : 'text-rose-700 dark:text-rose-300';
  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3">
      <div className="text-sm text-neutral-500">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${color}`}>{value}</div>
    </div>
  );
}
