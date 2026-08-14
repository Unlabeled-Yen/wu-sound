import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/supabase';
import { LEDGER_JOURNAL_LABEL, type LedgerJournal } from '@/lib/types';
import { summarizeReceivables, type ReceivableSummaryRow } from '@/lib/receivables-query';
import { taipeiCurrentMonthStr } from '@/lib/tz';

const fmt = (n: number) => n.toLocaleString('zh-TW');

function currentMonthRange(): { from: string; to: string } {
  const month = taipeiCurrentMonthStr();
  const [y, m] = month.split('-').map(Number);
  const from = `${month}-01`;
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const to = `${nextY}-${String(nextM).padStart(2, '0')}-01`;
  return { from, to };
}

type SecondaryLine = string | { text: string; href: string };

interface JournalStat {
  journal: LedgerJournal;
  primaryLabel: string;
  primaryValue: string;
  primaryTone: 'income' | 'expense' | 'neutral';
  secondaryLines: SecondaryLine[];
  primaryHref: string;
  /** 部分帳簿的主連結指向專屬入口(如薪資結算),需要額外提供「看帳目明細」的路 */
  entriesHref?: string;
  entriesLabel?: string;
}

// 帳簿看板:一進 /boss/ledger 先回答「今天有什麼帳務的事要做」,不用自己在表格裡找。
// 五本帳簿卡 + 一張跨帳簿的「AI 待確認」卡。查詢刻意平行下,避免序列等待拖慢首屏。
export default async function JournalDashboard() {
  const sb = getSupabaseAdmin();
  const { from, to } = currentMonthRange();

  const [
    receivablesRes,
    toIssueRes,
    toCheckRes,
    pettycashSubmittedRes,
    pettycashDraftRes,
    payrollRes,
    personalRes,
  ] = await Promise.all([
    // status 不在這裡篩——「什麼算未結」的判斷全部交給 summarizeReceivables 一個函式決定。
    sb.from('receivable_payment_state').select('direction, status, remaining_twd, overpaid'),
    sb.from('ledger_entries').select('journal').eq('invoice_status', 'to_issue').neq('state', 'voided'),
    sb.from('ledger_entries').select('id', { count: 'exact', head: true }).eq('to_check', true).neq('state', 'voided'),
    sb.from('expenses').select('id', { count: 'exact', head: true }).eq('status', 'submitted'),
    sb.from('expenses').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
    sb.from('ledger_entries').select('amount_twd').eq('journal', 'payroll').eq('state', 'posted').gte('occurred_on', from).lt('occurred_on', to),
    sb.from('ledger_entries').select('direction, amount_twd').eq('journal', 'personal').eq('state', 'posted').gte('occurred_on', from).lt('occurred_on', to),
  ]);

  // 缺就 loud:任何一條查詢失敗(例如 v3 migration 還沒套用、view/欄位不存在),
  // 都不准把「查不到」偽裝成「$0/沒有資料」——那是兩件完全不同的事,混在一起就是靜默說謊。
  const queryError =
    receivablesRes.error?.message ??
    toIssueRes.error?.message ??
    toCheckRes.error?.message ??
    pettycashSubmittedRes.error?.message ??
    pettycashDraftRes.error?.message ??
    payrollRes.error?.message ??
    personalRes.error?.message ??
    null;

  if (queryError) {
    return (
      <div
        className="rounded-2xl px-4 py-3 text-[13px]"
        style={{ background: 'rgba(224,122,122,0.08)', border: '1px solid rgba(224,122,122,0.34)', color: 'var(--nm-danger-glass-text)' }}
      >
        帳簿看板讀取失敗,以下數字不可信:{queryError}
      </div>
    );
  }

  const receivables = (receivablesRes.data ?? []) as ReceivableSummaryRow[];
  const toIssueByJournal = new Map<string, number>();
  for (const row of (toIssueRes.data ?? []) as Array<{ journal: string }>) {
    toIssueByJournal.set(row.journal, (toIssueByJournal.get(row.journal) ?? 0) + 1);
  }

  const {
    receivableOpenTotal: receivableTotal,
    payableOpenTotal: payableTotal,
    receivableOpenCount,
    payableOpenCount,
    overpaidCount,
  } = summarizeReceivables(receivables);

  const toIssueCustomer = toIssueByJournal.get('customer') ?? 0;
  const toIssueVendor = toIssueByJournal.get('vendor') ?? 0;
  const pettycashSubmitted = pettycashSubmittedRes.count ?? 0;
  const pettycashDraft = pettycashDraftRes.count ?? 0;
  const toCheckCount = toCheckRes.count ?? 0;

  // 薪資/獎金全部是支出(salary、bonus 都在 EXPENSE_KINDS 裡),單一數字就夠。
  const payrollExpense = ((payrollRes.data ?? []) as Array<{ amount_twd: number }>)
    .reduce((s, r) => s + r.amount_twd, 0);

  // 老闆個人/業外收支混合(loan 是收入,investment/health 是支出),分兩行顯示。
  const personalRows = (personalRes.data ?? []) as Array<{ direction: 'income' | 'expense'; amount_twd: number }>;
  const personalIncome = personalRows.filter((r) => r.direction === 'income').reduce((s, r) => s + r.amount_twd, 0);
  const personalExpense = personalRows.filter((r) => r.direction === 'expense').reduce((s, r) => s + r.amount_twd, 0);

  const stats: JournalStat[] = [
    {
      journal: 'customer',
      primaryLabel: '在手應收',
      primaryValue: `$${fmt(receivableTotal)}`,
      primaryTone: 'income',
      secondaryLines: [
        `${receivableOpenCount} 筆未結`,
        ...(toIssueCustomer > 0 ? [{ text: `${toIssueCustomer} 張待開發票`, href: '/boss/ledger/invoices?journal=customer' }] : []),
      ],
      primaryHref: '/boss/ledger/receivables?direction=receivable',
    },
    {
      journal: 'vendor',
      primaryLabel: '在手應付',
      primaryValue: `$${fmt(payableTotal)}`,
      primaryTone: 'expense',
      secondaryLines: [
        `${payableOpenCount} 筆未結`,
        ...(toIssueVendor > 0 ? [{ text: `${toIssueVendor} 張待開發票`, href: '/boss/ledger/invoices?journal=vendor' }] : []),
      ],
      primaryHref: '/boss/ledger/receivables?direction=payable',
    },
    {
      // 主數字以「待老闆審核」為準,跟總覽頁的「待審零用金」同一個定義(F6)——
      // 員工還沒送出的草稿不計入主數字,只當次要提醒,避免同一件事出現兩個數字。
      journal: 'pettycash',
      primaryLabel: '零用金待處理',
      primaryValue: `${pettycashSubmitted} 筆`,
      primaryTone: 'neutral',
      secondaryLines: [
        ...(pettycashSubmitted > 0 ? ['待你審核'] : []),
        ...(pettycashDraft > 0 ? [`另 ${pettycashDraft} 筆員工尚未送出`] : []),
        ...(pettycashSubmitted === 0 && pettycashDraft === 0 ? ['沒有待處理項目'] : []),
      ],
      primaryHref: '/boss/expenses',
    },
    {
      // 主連結指薪資結算入口(真正的結算動作在那裡),數字是本月已入帳的薪資支出(F8/F9)。
      journal: 'payroll',
      primaryLabel: '本月薪資支出',
      primaryValue: `$${fmt(payrollExpense)}`,
      primaryTone: 'expense',
      secondaryLines: ['本月結算入口'],
      primaryHref: '/boss/close',
      entriesHref: '/boss/ledger/entries?journal=payroll',
      entriesLabel: '看薪資帳目',
    },
    {
      journal: 'personal',
      primaryLabel: '本月業外/個人',
      primaryValue: `收 $${fmt(personalIncome)}`,
      primaryTone: 'income',
      secondaryLines: [`支 $${fmt(personalExpense)}`, '借款/投資/健檢等'],
      primaryHref: '/boss/ledger/entries?journal=personal',
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {stats.map((s) => (
          <JournalCard key={s.journal} stat={s} />
        ))}

        {(toCheckCount > 0 || overpaidCount > 0) && (
          <div
            className="rounded-2xl nm-raised p-4 flex flex-col gap-1"
            style={{ border: '1px solid rgba(217,181,107,0.3)' }}
          >
            <div className="text-[13px]" style={{ color: 'var(--nm-warning-glass-text)' }}>待確認</div>
            {toCheckCount > 0 && (
              <Link href="/boss/ledger/entries?to_check=1" className="text-lg font-semibold underline" style={{ color: 'var(--nm-warning-glass-text)' }}>
                {toCheckCount} 筆 AI 沒把握
              </Link>
            )}
            {overpaidCount > 0 && (
              <Link href="/boss/ledger/receivables" className="text-[13px] underline" style={{ color: 'var(--nm-danger-glass-text)' }}>
                {overpaidCount} 筆應收應付超收/超付,請檢查
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function JournalCard({ stat }: { stat: JournalStat }) {
  const toneColor =
    stat.primaryTone === 'income' ? 'var(--nm-success-glass-text)'
    : stat.primaryTone === 'expense' ? 'var(--nm-danger-glass-text)'
    : 'var(--nm-text-body)';

  return (
    <div className="rounded-2xl nm-raised p-4 flex flex-col gap-1">
      <Link href={stat.primaryHref} className="flex flex-col gap-1 hover:opacity-90 transition-opacity">
        <div className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>
          {LEDGER_JOURNAL_LABEL[stat.journal]}帳簿 · {stat.primaryLabel}
        </div>
        <div className="text-xl font-semibold" style={{ color: toneColor }}>{stat.primaryValue}</div>
        {/* 純文字的次要行留在主連結裡;可下鑽的行(如待開發票筆數)要指向不同頁面,
            不能巢狀塞進同一個 <a>,拆到外面獨立渲染成自己的連結。 */}
        {stat.secondaryLines.filter((l): l is string => typeof l === 'string').map((line) => (
          <div key={line} className="text-xs" style={{ color: 'var(--nm-text-muted)' }}>{line}</div>
        ))}
      </Link>
      {stat.secondaryLines.filter((l): l is Exclude<SecondaryLine, string> => typeof l !== 'string').map((line) => (
        <Link key={line.href} href={line.href} className="text-xs underline self-start" style={{ color: 'var(--nm-text-muted)' }}>
          {line.text}
        </Link>
      ))}
      <div className="flex gap-3 mt-1">
        <Link
          href={`/boss/ledger/new?journal=${stat.journal}`}
          className="text-xs underline self-start"
          style={{ color: 'var(--nm-text-muted)' }}
        >
          + 記一筆
        </Link>
        {stat.entriesHref && (
          <Link
            href={stat.entriesHref}
            className="text-xs underline self-start"
            style={{ color: 'var(--nm-text-muted)' }}
          >
            {stat.entriesLabel ?? '看帳目明細'}
          </Link>
        )}
      </div>
    </div>
  );
}
