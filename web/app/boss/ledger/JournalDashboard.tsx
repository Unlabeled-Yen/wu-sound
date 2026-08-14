import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/supabase';
import { LEDGER_JOURNAL_LABEL, type LedgerJournal } from '@/lib/types';

const fmt = (n: number) => n.toLocaleString('zh-TW');

interface JournalStat {
  journal: LedgerJournal;
  primaryLabel: string;
  primaryValue: string;
  primaryTone: 'income' | 'expense' | 'neutral';
  secondaryLines: string[];
  primaryHref: string;
}

// 帳簿看板:一進 /boss/ledger 先回答「今天有什麼帳務的事要做」,不用自己在表格裡找。
// 五本帳簿卡 + 一張跨帳簿的「AI 待確認」卡。查詢刻意平行下,避免序列等待拖慢首屏。
export default async function JournalDashboard() {
  const sb = getSupabaseAdmin();

  const [receivablesRes, toIssueRes, toCheckRes, pettycashSubmittedRes, pettycashDraftRes] = await Promise.all([
    sb.from('receivable_payment_state').select('direction, remaining_twd, overpaid').eq('status', 'open'),
    sb.from('ledger_entries').select('journal').eq('invoice_status', 'to_issue').neq('state', 'voided'),
    sb.from('ledger_entries').select('id', { count: 'exact', head: true }).eq('to_check', true).neq('state', 'voided'),
    sb.from('expenses').select('id', { count: 'exact', head: true }).eq('status', 'submitted'),
    sb.from('expenses').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
  ]);

  // 缺就 loud:任何一條查詢失敗(例如 v3 migration 還沒套用、view/欄位不存在),
  // 都不准把「查不到」偽裝成「$0/沒有資料」——那是兩件完全不同的事,混在一起就是靜默說謊。
  const queryError =
    receivablesRes.error?.message ??
    toIssueRes.error?.message ??
    toCheckRes.error?.message ??
    pettycashSubmittedRes.error?.message ??
    pettycashDraftRes.error?.message ??
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

  const receivables = (receivablesRes.data ?? []) as Array<{ direction: 'receivable' | 'payable'; remaining_twd: number; overpaid: boolean }>;
  const toIssueByJournal = new Map<string, number>();
  for (const row of (toIssueRes.data ?? []) as Array<{ journal: string }>) {
    toIssueByJournal.set(row.journal, (toIssueByJournal.get(row.journal) ?? 0) + 1);
  }

  const receivableOpen = receivables.filter((r) => r.direction === 'receivable');
  const payableOpen = receivables.filter((r) => r.direction === 'payable');
  const receivableTotal = receivableOpen.reduce((s, r) => s + Math.max(0, r.remaining_twd), 0);
  const payableTotal = payableOpen.reduce((s, r) => s + Math.max(0, r.remaining_twd), 0);
  const overpaidCount = receivables.filter((r) => r.overpaid).length;

  const toIssueCustomer = toIssueByJournal.get('customer') ?? 0;
  const toIssueVendor = toIssueByJournal.get('vendor') ?? 0;
  const pettycashSubmitted = pettycashSubmittedRes.count ?? 0;
  const pettycashDraft = pettycashDraftRes.count ?? 0;
  const toCheckCount = toCheckRes.count ?? 0;

  const stats: JournalStat[] = [
    {
      journal: 'customer',
      primaryLabel: '在手應收',
      primaryValue: `$${fmt(receivableTotal)}`,
      primaryTone: 'income',
      secondaryLines: [
        `${receivableOpen.length} 筆未結`,
        ...(toIssueCustomer > 0 ? [`${toIssueCustomer} 張待開發票`] : []),
      ],
      primaryHref: '/boss/ledger/receivables?direction=receivable',
    },
    {
      journal: 'vendor',
      primaryLabel: '在手應付',
      primaryValue: `$${fmt(payableTotal)}`,
      primaryTone: 'expense',
      secondaryLines: [
        `${payableOpen.length} 筆未結`,
        ...(toIssueVendor > 0 ? [`${toIssueVendor} 張待開發票`] : []),
      ],
      primaryHref: '/boss/ledger/receivables?direction=payable',
    },
    {
      journal: 'pettycash',
      primaryLabel: '零用金待處理',
      primaryValue: `${pettycashSubmitted + pettycashDraft} 筆`,
      primaryTone: 'neutral',
      secondaryLines: [
        ...(pettycashSubmitted > 0 ? [`${pettycashSubmitted} 筆待老闆審核`] : []),
        ...(pettycashDraft > 0 ? [`${pettycashDraft} 筆員工尚未送出`] : []),
        ...(pettycashSubmitted + pettycashDraft === 0 ? ['沒有待處理項目'] : []),
      ],
      primaryHref: '/boss/expenses',
    },
    {
      journal: 'payroll',
      primaryLabel: '薪資/獎金',
      primaryValue: '查看',
      primaryTone: 'neutral',
      secondaryLines: ['本月結算入口'],
      primaryHref: '/boss/ledger?journal=payroll',
    },
    {
      journal: 'personal',
      primaryLabel: '老闆個人/業外',
      primaryValue: '查看',
      primaryTone: 'neutral',
      secondaryLines: ['借款/投資/健檢等'],
      primaryHref: '/boss/ledger?journal=personal',
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
              <Link href="/boss/ledger?to_check=1" className="text-lg font-semibold underline" style={{ color: 'var(--nm-warning-glass-text)' }}>
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
        {stat.secondaryLines.map((line) => (
          <div key={line} className="text-xs" style={{ color: 'var(--nm-text-muted)' }}>{line}</div>
        ))}
      </Link>
      <Link
        href={`/boss/ledger/new?journal=${stat.journal}`}
        className="text-xs underline mt-1 self-start"
        style={{ color: 'var(--nm-text-muted)' }}
      >
        + 記一筆
      </Link>
    </div>
  );
}
