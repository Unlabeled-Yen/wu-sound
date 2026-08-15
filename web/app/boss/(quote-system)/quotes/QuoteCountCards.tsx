import Link from 'next/link';

export interface CountCardData {
  key: string;
  label: string;
  count: number;
  suffix?: string;
  tone: 'warning' | 'neutral' | 'success';
}

const TONE_STYLE: Record<CountCardData['tone'], React.CSSProperties> = {
  warning: { background: 'rgba(217,181,107,.08)', border: '1px solid rgba(217,181,107,.28)' },
  neutral: { background: 'rgba(30,30,36,.3)', border: '1px solid rgba(255,255,255,.17)' },
  success: { background: 'rgba(30,30,36,.3)', border: '1px solid rgba(255,255,255,.17)' },
};
const TONE_LABEL_COLOR: Record<CountCardData['tone'], string> = {
  warning: 'var(--nm-warning-glass-text)',
  neutral: 'var(--nm-text-muted)',
  success: 'var(--nm-text-muted)',
};
const TONE_NUM_COLOR: Record<CountCardData['tone'], string> = {
  warning: 'var(--nm-warning-glass-text)',
  neutral: 'var(--nm-text-primary)',
  success: 'var(--nm-success-glass-text)',
};

// 四張狀態計數卡皆為篩選入口——點了直接套 ?filter=,不用另外做篩選 UI。
export function QuoteCountCards({ cards, activeFilter, baseHref }: {
  cards: CountCardData[];
  activeFilter: string | null;
  baseHref: string;
}) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      {cards.map((c) => (
        <Link
          key={c.key}
          href={activeFilter === c.key ? baseHref : `${baseHref}?filter=${c.key}`}
          className="rounded-[20px] px-5 py-4.5 block"
          style={{ ...TONE_STYLE[c.tone], padding: '18px 20px', outline: activeFilter === c.key ? '1.5px solid rgba(255,255,255,.4)' : undefined }}
        >
          <div className="text-[12px] mb-3" style={{ color: TONE_LABEL_COLOR[c.tone] }}>{c.label}</div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[26px] font-semibold tabular-nums" style={{ color: TONE_NUM_COLOR[c.tone] }}>{c.count}</span>
            <span className="text-[12px]" style={{ color: 'var(--nm-text-secondary)' }}>{c.suffix ?? '張'}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
