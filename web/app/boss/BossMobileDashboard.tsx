import Link from 'next/link';

const fmt = (n: number) => n.toLocaleString('zh-TW');

export type MobileDashStats = {
  month: string;
  income: number;
  expense: number;
  net: number;
  pendingCount: number;
  pendingAmount: number;
  draftCount: number;
  quoteDraft: number;
  quoteSent: number;
  repairCount: number;
};

export default function BossMobileDashboard({ s }: { s: MobileDashStats }) {
  const netColor = s.net >= 0 ? 'var(--nm-success)' : 'var(--nm-danger)';

  const settlementValue = s.pendingCount > 0 ? '未結' : '可結';
  const settlementHint =
    s.pendingCount > 0 ? `尚有 ${s.pendingCount} 筆未處理` : '所有代墊已審完';
  const quoteTotal = s.quoteDraft + s.quoteSent;

  const actions: Array<{
    href: string;
    label: string;
    hint: string;
    value: string;
    color: string;
  }> = [
    {
      href: '/boss/expenses',
      label: '待審零用金',
      hint:
        s.pendingCount === 0 && s.draftCount === 0
          ? '沒有待審'
          : s.pendingCount === 0
            ? `員工還有 ${s.draftCount} 筆草稿未送出`
            : `合計 $${fmt(s.pendingAmount)}${s.draftCount > 0 ? ` · 另 ${s.draftCount} 筆草稿` : ''}`,
      value: String(s.pendingCount),
      color: s.pendingCount > 0 ? 'var(--nm-warning)' : 'var(--nm-text-primary)',
    },
    {
      href: `/boss/close?month=${s.month}`,
      label: '薪資結算',
      hint: settlementHint,
      value: settlementValue,
      color: s.pendingCount > 0 ? 'var(--nm-warning)' : 'var(--nm-success)',
    },
    {
      href: '/boss/quotes',
      label: '進行中報價',
      hint: `草稿 ${s.quoteDraft} · 已送出 ${s.quoteSent}`,
      value: String(quoteTotal),
      color: 'var(--nm-text-primary)',
    },
    {
      href: '/boss/equipment?status=in_repair',
      label: '設備維修中',
      hint: s.repairCount === 0 ? '目前沒有維修' : '需要追蹤',
      value: String(s.repairCount),
      color: s.repairCount > 0 ? 'var(--nm-warning)' : 'var(--nm-text-primary)',
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Hero 淨額卡 */}
      <div
        className="rounded-[22px] nm-raised-sm p-[22px]"
      >
        <div className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>
          本月淨額
        </div>
        <div
          className="text-[40px] font-semibold tabular-nums leading-none mt-2 tracking-[-0.01em]"
          style={{ color: netColor }}
        >
          ${fmt(s.net)}
        </div>
        <div className="mt-3 flex gap-[18px] text-[13px] tabular-nums" style={{ color: '#b8b8bb' }}>
          <span>收 ${fmt(s.income)}</span>
          <span style={{ color: 'var(--nm-text-muted)' }}>支 ${fmt(s.expense)}</span>
        </div>
      </div>

      {/* Action rows */}
      <div className="flex flex-col gap-3">
        <div
          className="text-[12px] uppercase tracking-[0.14em]"
          style={{ color: '#8a8b90', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
        >
          需要你處理
        </div>
        {actions.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="nm-raised nm-focus rounded-[18px] px-[18px] py-4 flex items-center gap-3.5"
            style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
          >
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-medium" style={{ color: 'var(--nm-text-body)' }}>
                {a.label}
              </div>
              <div className="text-[12.5px] mt-[3px]" style={{ color: 'var(--nm-text-secondary)' }}>
                {a.hint}
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span
                className="text-[20px] font-semibold tabular-nums"
                style={{ color: a.color }}
              >
                {a.value}
              </span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6d6e73" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 6 6 6-6 6" />
              </svg>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
