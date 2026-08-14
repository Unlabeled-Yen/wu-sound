import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/supabase';
import BossMobileDashboard from './BossMobileDashboard';
import { taipeiCurrentMonthStr } from '@/lib/tz';
import { summarizeEntries } from '@/lib/ledger-summary';

export const dynamic = 'force-dynamic';

function currentMonth(): string {
  return taipeiCurrentMonthStr();
}

function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const from = `${month}-01`;
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const to = `${nextY}-${String(nextM).padStart(2, '0')}-01`;
  return { from, to };
}

const fmt = (n: number) => n.toLocaleString('zh-TW');

async function loadStats() {
  const sb = getSupabaseAdmin();
  const month = currentMonth();
  const { from, to } = monthRange(month);

  const [ledgerRes, expensesRes, draftsRes, monthExpensesRes, quotesRes, equipmentRes] = await Promise.all([
    sb
      .from('ledger_entries')
      .select('direction, amount_twd, fee_twd')
      .eq('state', 'posted')
      .gte('occurred_on', from)
      .lt('occurred_on', to),
    sb.from('expenses').select('id, amount_twd, users!inner(id)').eq('status', 'submitted'),
    sb.from('expenses').select('id, users!inner(id)').eq('status', 'draft'),
    // 薪資結算「可否結算」跟 /boss/close 用同一套判斷:當月 draft+submitted 都算未處理,
    // 不能只看全時段 submitted——否則這張卡跟點進去看到的紅框會對不上。
    sb.from('expenses').select('id, status, spent_on, captured_at').in('status', ['draft', 'submitted']),
    sb.from('quotes').select('id, status').in('status', ['draft', 'sent']),
    sb.from('equipment').select('id').eq('status', 'in_repair'),
  ]);

  const ledgerRows = ledgerRes.data ?? [];
  // 用 summarizeEntries 而非自己 reduce——跟 /boss/ledger 共用同一份計算,
  // 一致性由建構保證,不是靠事後人工比對數字。
  const { income, expense, net } = summarizeEntries(ledgerRows);

  const pendingExpense = expensesRes.data ?? [];
  const pendingCount = pendingExpense.length;
  const pendingAmount = pendingExpense.reduce((s, r) => s + (r.amount_twd ?? 0), 0);
  const draftCount = (draftsRes.data ?? []).length;

  const closeBlockedCount = (monthExpensesRes.data ?? []).filter((r) => {
    const src = (r.spent_on ?? r.captured_at) as string;
    return String(src).slice(0, 7) === month;
  }).length;

  const quoteRows = quotesRes.data ?? [];
  const quoteDraft = quoteRows.filter((r) => r.status === 'draft').length;
  const quoteSent = quoteRows.filter((r) => r.status === 'sent').length;

  const repairCount = (equipmentRes.data ?? []).length;

  return {
    month,
    income,
    expense,
    net,
    pendingCount,
    pendingAmount,
    draftCount,
    closeBlockedCount,
    quoteDraft,
    quoteSent,
    repairCount,
    errors: {
      ledger: ledgerRes.error?.message,
      expenses: expensesRes.error?.message,
      monthExpenses: monthExpensesRes.error?.message,
      quotes: quotesRes.error?.message,
      equipment: equipmentRes.error?.message,
    },
  };
}

export default async function BossDashboard() {
  const s = await loadStats();
  const anyError = Object.values(s.errors).some(Boolean);

  return (
    <>
      {/* Mobile-only view */}
      <div className="lg:hidden">
        {anyError && (
          <div
            className="rounded-xl p-4 text-[13px] nm-inset mb-4"
            style={{ color: 'var(--nm-danger)' }}
          >
            部分資料讀取失敗
          </div>
        )}
        <BossMobileDashboard s={s} />
      </div>

      {/* Desktop view (unchanged) */}
      <div className="space-y-4 hidden lg:block">
      <div>
        <div className="text-[13px]" style={{ color: 'var(--nm-text-muted)' }}>本月 {s.month}</div>
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--nm-text-primary)' }}>總覽</h1>
      </div>

      {anyError && (
        <div
          className="rounded-xl p-4 text-[13px] nm-inset"
          style={{ color: 'var(--nm-danger)' }}
        >
          部分資料讀取失敗:
          {Object.entries(s.errors)
            .filter(([, v]) => v)
            .map(([k, v]) => `${k}:${v}`)
            .join(' / ')}
        </div>
      )}

      {/* 財務三卡 */}
      <section>
        <div className="text-[11px] uppercase tracking-wider mb-3" style={{ color: 'var(--nm-text-muted)' }}>財務</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <StatCard
            href="/boss/ledger"
            label="本月淨額(已扣手續費)"
            value={`$${fmt(s.net)}`}
            hint={`收 $${fmt(s.income)} · 支 $${fmt(s.expense)}`}
            tone={s.net >= 0 ? 'positive' : 'negative'}
          />
          <StatCard
            href="/boss/expenses"
            label="待審零用金"
            value={`${s.pendingCount} 筆`}
            hint={
              s.pendingCount === 0 && s.draftCount === 0
                ? '沒有待審'
                : s.pendingCount === 0
                  ? `員工還有 ${s.draftCount} 筆草稿未送出`
                  : `合計 $${fmt(s.pendingAmount)}${s.draftCount > 0 ? ` · 另 ${s.draftCount} 筆員工草稿` : ''}`
            }
            tone={s.pendingCount > 0 ? 'attention' : s.draftCount > 0 ? 'attention' : 'neutral'}
          />
          <StatCard
            href={`/boss/close?month=${s.month}`}
            label="薪資結算"
            value={s.closeBlockedCount > 0 ? '未可結算' : '可結算'}
            hint={s.closeBlockedCount > 0 ? `本月尚有 ${s.closeBlockedCount} 筆未處理` : '本月代墊已審完'}
            tone={s.closeBlockedCount > 0 ? 'attention' : 'positive'}
          />
        </div>
      </section>

      {/* 業務 + 設備 */}
      <section>
        <div className="text-[11px] uppercase tracking-wider mb-3" style={{ color: 'var(--nm-text-muted)' }}>業務與設備</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <StatCard
            href="/boss/quotes"
            label="進行中報價"
            value={`${s.quoteDraft + s.quoteSent} 張`}
            hint={`草稿 ${s.quoteDraft} · 已送出 ${s.quoteSent}`}
            tone="neutral"
          />
          <StatCard
            href="/boss/equipment?status=in_repair"
            label="設備維修中"
            value={`${s.repairCount} 件`}
            hint={s.repairCount === 0 ? '目前沒有維修' : '需要追蹤'}
            tone={s.repairCount > 0 ? 'attention' : 'neutral'}
          />
          <StatCard
            href="/boss/worklogs"
            label="現場動態"
            value="查看"
            hint="打卡 · 工作記錄"
            tone="neutral"
          />
        </div>
      </section>

      <section className="pt-2">
        <div className="text-[11px] uppercase tracking-wider mb-3" style={{ color: 'var(--nm-text-muted)' }}>快速動作</div>
        <div className="flex flex-wrap gap-2">
          <QuickLink href={`/boss/ledger/new?month=${s.month}`}>新增帳目</QuickLink>
          <QuickLink href="/boss/quotes/new">新增報價</QuickLink>
          <QuickLink href="/boss/equipment/new">新增設備</QuickLink>
          <QuickLink href="/boss/catalog">價目表</QuickLink>
        </div>
      </section>
      </div>
    </>
  );
}

function StatCard({
  href,
  label,
  value,
  hint,
  tone,
}: {
  href: string;
  label: string;
  value: string;
  hint: string;
  tone: 'positive' | 'negative' | 'attention' | 'neutral';
}) {
  const toneColor = {
    positive: 'var(--nm-success)',
    negative: 'var(--nm-danger)',
    attention: 'var(--nm-warning)',
    neutral: 'var(--nm-text-primary)',
  }[tone];
  return (
    <Link
      href={href}
      className="group rounded-2xl nm-raised nm-lift nm-focus p-4 flex flex-col gap-1.5 min-h-[148px]"
    >
      <div className="text-[13px]" style={{ color: 'var(--nm-text-muted)' }}>{label}</div>
      <div className="text-3xl font-semibold tabular-nums" style={{ color: toneColor }}>{value}</div>
      <div className="text-xs" style={{ color: 'var(--nm-text-secondary)' }}>{hint}</div>
      <div
        className="mt-auto text-xs opacity-60 group-hover:opacity-100 transition-opacity"
        style={{ color: 'var(--nm-text-secondary)' }}
      >
        點擊進入 →
      </div>
    </Link>
  );
}

function QuickLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="nm-btn nm-focus inline-flex items-center justify-center text-[13px]"
    >
      {children}
    </Link>
  );
}
