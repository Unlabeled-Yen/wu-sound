import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/supabase';
import { summarizeEntries } from '@/lib/ledger-summary';
import JournalDashboard from './JournalDashboard';
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
}

function buildHref(month: string): string {
  return `/boss/ledger?month=${month}`;
}

const fmt = (n: number) => n.toLocaleString('zh-TW');

// 帳簿看板首頁:一進頁面先看「今天有什麼帳務的事要做」,不用先在表格裡找。
// 明細/篩選/匯出全部移到 /boss/ledger/entries——這裡是全月總覽,語意單一,
// 摘要卡永遠是「本月全部帳簿」,不受任何篩選影響,不會跟看板卡的數字打架。
export default async function LedgerDashboardPage(
  { searchParams }: { searchParams: Promise<SP> },
) {
  const sp = (await searchParams) ?? {};
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : currentMonth();
  const { from, to } = monthRange(month);
  const sb = getSupabaseAdmin();

  const sumRes = await sb
    .from('ledger_entries')
    .select('direction, amount_twd, fee_twd, is_external, tax_amount_twd')
    .gte('occurred_on', from)
    .lte('occurred_on', to)
    .eq('status', 'active');

  const summaryError = sumRes.error?.message ?? null;
  const { income, expense, net, extIncome, extTax, feeTotal } = summarizeEntries(sumRes.data ?? []);

  return (
    <div className="space-y-4">
      {/* 帳簿看板:一進頁面先看「有什麼事要做」,不用自己在表格裡找 */}
      <JournalDashboard />

      {/* 月份導覽 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-[13px]">
          <Link href={buildHref(shiftMonth(month, -1))} className="nm-btn" style={{ padding: '4px 10px', minHeight: 'auto' }}>← 上月</Link>
          <span className="font-semibold min-w-[6rem] text-center" style={{ color: 'var(--nm-text-primary)' }}>{month}</span>
          <Link href={buildHref(shiftMonth(month, 1))} className="nm-btn" style={{ padding: '4px 10px', minHeight: 'auto' }}>下月 →</Link>
          <Link href={buildHref(currentMonth())} className="underline" style={{ color: 'var(--nm-text-muted)', padding: '4px 8px' }}>回本月</Link>
        </div>
      </div>

      {/* 本月摘要卡:全部帳簿、不受篩選影響——語意單一,標籤明確寫「本月全部帳簿」 */}
      {summaryError ? (
        <div
          className="rounded-2xl px-4 py-3 text-[13px]"
          style={{ background: 'rgba(224,122,122,0.08)', border: '1px solid rgba(224,122,122,0.34)', color: 'var(--nm-danger-glass-text)' }}
        >
          本月摘要讀取失敗,以下數字不可信:{summaryError}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryCard label="本月收入合計(全部帳簿)" value={`$${fmt(income)}`} tone="income" />
          <SummaryCard label="本月支出合計(全部帳簿)" value={`$${fmt(expense)}`} tone="expense" />
          <SummaryCard label="本月淨額(已扣手續費)" value={`$${fmt(net)}`} tone={net >= 0 ? 'income' : 'expense'} />
          <div className="rounded-2xl nm-raised-sm p-3 text-[13px]">
            <div style={{ color: 'var(--nm-text-secondary)' }}>外帳彙總</div>
            <div className="mt-1" style={{ color: 'var(--nm-text-body)' }}>收入合計 <span className="font-semibold">${fmt(extIncome)}</span></div>
            <div style={{ color: 'var(--nm-text-body)' }}>稅額合計 <span className="font-semibold">${fmt(extTax)}</span></div>
          </div>
          <div className="rounded-2xl nm-raised-sm p-3 text-[13px]">
            <div style={{ color: 'var(--nm-text-secondary)' }}>轉帳手續費合計</div>
            <div className="mt-1 text-lg font-semibold" style={{ color: 'var(--nm-text-body)' }}>${fmt(feeTotal)}</div>
          </div>
        </div>
      )}

      {/* 底部按鈕列 */}
      <div className="flex flex-wrap gap-3 items-center pt-2">
        <Link href={`/boss/ledger/new?month=${month}`} className="nm-btn-solid text-[13px]">新增一筆</Link>
        <Link href={`/boss/ledger/entries?month=${month}`} className="nm-btn text-[13px]">看全部帳目</Link>
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
