import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';
import { LEDGER_JOURNAL_LABEL, type LedgerEntry, type LedgerJournal } from '@/lib/types';
import { taipeiTodayStr } from '@/lib/tz';
import InvoiceRowMobile from './InvoiceRowMobile';

export const dynamic = 'force-dynamic';

// 待開發票逾期門檻。先定 14 天,可調——這個數字沒有業務規則背書,是工程預設值。
export const OVERDUE_DAYS = 14;

type Row = LedgerEntry & { sites?: { name: string } | null };

function daysElapsed(occurredOn: string, today: string): number {
  const [oy, om, od] = occurredOn.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  const ms = Date.UTC(ty, tm - 1, td) - Date.UTC(oy, om - 1, od);
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ journal?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'boss') redirect('/staff');

  const sp = await searchParams;
  const journal = sp.journal && sp.journal in LEDGER_JOURNAL_LABEL ? (sp.journal as LedgerJournal) : undefined;

  const sb = getSupabaseAdmin();
  let q = sb
    .from('ledger_entries')
    .select('*, sites(name)')
    .eq('invoice_status', 'to_issue')
    .neq('state', 'voided')
    .order('occurred_on', { ascending: true });
  if (journal) q = q.eq('journal', journal);
  const { data, error } = await q;

  const today = taipeiTodayStr();
  const rows: Row[] = ((data ?? []) as Row[]);
  const fmt = (n: number) => n.toLocaleString('zh-TW');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--nm-text-primary)' }}>待開發票</h1>
          <p className="text-[13px] mt-0.5" style={{ color: 'var(--nm-text-secondary)' }}>
            這裡列的是已入帳、但發票還沒開出去的帳目;超過 {OVERDUE_DAYS} 天以警示色標示。
          </p>
        </div>
        <Link href="/boss/ledger" className="text-[13px] underline" style={{ color: 'var(--nm-text-muted)' }}>← 回帳務</Link>
      </div>

      {journal && (
        <div
          className="rounded-xl px-3 py-2 text-[13px] flex items-center gap-2"
          style={{ background: 'rgba(126,207,157,0.08)', border: '1px solid rgba(126,207,157,0.26)', color: 'var(--nm-success-glass-text)' }}
        >
          篩選中:「{LEDGER_JOURNAL_LABEL[journal]}」帳簿
          <Link href="/boss/ledger/invoices" className="underline ml-auto" style={{ color: 'var(--nm-text-muted)' }}>清除篩選</Link>
        </div>
      )}

      {error && (
        <div className="rounded-xl p-3 text-[13px]" style={{ background: 'rgba(224,122,122,0.08)', border: '1px solid rgba(224,122,122,0.34)', color: 'var(--nm-danger-glass-text)' }}>
          讀取失敗:{error.message}
        </div>
      )}

      {!error && (
        <>
          {/* 手機:卡片流 */}
          <div className="lg:hidden flex flex-col gap-3">
            {rows.length === 0 && (
              <p className="text-[13px] text-center py-6" style={{ color: 'var(--nm-text-secondary)' }}>沒有待開發票</p>
            )}
            {rows.map((r) => (
              <InvoiceRowMobile key={r.id} row={r} daysOverdueThreshold={OVERDUE_DAYS} today={today} />
            ))}
          </div>

          {/* 桌機:表格 */}
          <div className="hidden lg:block rounded-2xl nm-raised overflow-x-auto overflow-y-auto">
            <table className="w-full text-[13px]" style={{ minWidth: 900, borderCollapse: 'collapse' }}>
              <thead style={{ background: 'rgba(20,20,24,0.92)' }}>
                <tr style={{ color: 'var(--nm-text-muted)' }}>
                  <th className="text-left px-3 py-2 font-normal whitespace-nowrap">日期</th>
                  <th className="text-left px-3 py-2 font-normal whitespace-nowrap">帳簿</th>
                  <th className="text-left px-3 py-2 font-normal whitespace-nowrap">對象</th>
                  <th className="text-left px-3 py-2 font-normal whitespace-nowrap">案場</th>
                  <th className="text-right px-3 py-2 font-normal whitespace-nowrap">金額</th>
                  <th className="text-right px-3 py-2 font-normal whitespace-nowrap">稅額</th>
                  <th className="text-right px-3 py-2 font-normal whitespace-nowrap">已過天數</th>
                  <th className="text-left px-3 py-2 font-normal whitespace-nowrap">動作</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={8} className="px-3 py-6 text-center whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>沒有待開發票</td></tr>
                )}
                {rows.map((r) => {
                  const days = daysElapsed(r.occurred_on, today);
                  const overdue = days > OVERDUE_DAYS;
                  return (
                    <tr
                      key={r.id}
                      style={{ borderTop: '1px solid var(--nm-border-hair)', background: overdue ? 'rgba(224,122,122,0.06)' : undefined }}
                    >
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>{r.occurred_on}</td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--nm-text-body)' }}>{LEDGER_JOURNAL_LABEL[r.journal]}</td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>{r.party ?? '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>{r.sites?.name ?? '—'}</td>
                      <td className="px-3 py-2 text-right font-mono tabular whitespace-nowrap" style={{ color: 'var(--nm-text-body)' }}>${fmt(r.amount_twd)}</td>
                      <td className="px-3 py-2 text-right font-mono tabular whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>${fmt(r.tax_amount_twd)}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap" style={{ color: overdue ? 'var(--nm-danger-glass-text)' : 'var(--nm-text-secondary)' }}>
                        {days} 天{overdue ? '(逾期)' : ''}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <Link href={`/boss/ledger/${r.id}`} className="underline" style={{ color: 'var(--nm-text-secondary)' }}>編輯</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
