import Link from 'next/link';
import { QUOTE_STATUS_LABEL, type Quote } from '@/lib/types';
import { QUOTE_STATUS_PILL_CLASS, QUOTE_STATUS_PILL_STYLE } from '../quote-status-style';

const fmt = (n: number) => n.toLocaleString('zh-TW');

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

const BAR_COLOR = {
  missing: 'var(--nm-warning)',
  draft: 'rgba(255,255,255,.14)',
  sent: 'rgba(255,255,255,.3)',
  won: 'rgba(126,207,157,.6)',
  lost: 'rgba(224,122,122,.4)',
};

export interface QuoteRowData {
  quote: Quote;
  lineCount: number;
  missing: number;
  total: number;
}

// 每列:左側 3px 色條(該不該動它的第一眼訊號)＋客戶＋meta＋狀態欄固定
// 150px 右對齊＋金額固定 130px 右對齊等寬數字＋日期固定 88px——欄位總寬固定,
// 不再需要橫向捲動。
export function QuoteListRow({ row }: { row: QuoteRowData }) {
  const { quote: q, lineCount, missing, total } = row;

  let barColor = BAR_COLOR[q.status];
  let meta: string;
  let dateLabel: string;

  if (missing > 0) {
    barColor = BAR_COLOR.missing;
    meta = `${q.project_name ?? '—'}　·　${lineCount} 項明細`;
    dateLabel = q.created_at.slice(5, 10);
  } else if (q.status === 'sent') {
    meta = q.sent_at
      ? `${q.project_name ?? '—'}　·　已送出 ${daysSince(q.sent_at)} 天,未回覆`
      : `${q.project_name ?? '—'}　·　已送出`;
    dateLabel = (q.sent_at ?? q.created_at).slice(5, 10);
  } else if (q.status === 'won') {
    meta = `${q.project_name ?? '—'}　·　成交`;
    dateLabel = (q.won_at ?? q.updated_at).slice(5, 10);
  } else if (q.status === 'lost') {
    meta = `${q.project_name ?? '—'}　·　未成交`;
    dateLabel = q.updated_at.slice(5, 10);
  } else {
    meta = `${q.project_name ?? '—'}　·　${lineCount} 項明細`;
    dateLabel = q.created_at.slice(5, 10);
  }

  return (
    <Link
      href={`/boss/quotes/${q.id}`}
      className="flex items-center gap-4.5 py-4 nm-lift"
      style={{ borderBottom: '1px solid var(--nm-border-hair)', background: missing > 0 ? 'rgba(217,181,107,.04)' : undefined, gap: 18 }}
    >
      <span className="shrink-0" style={{ width: 3, height: 36, background: barColor, borderRadius: 2 }} />
      <div className="flex-1 min-w-0">
        <div className="text-[14.5px] font-medium truncate" style={{ color: 'var(--nm-text-primary)' }}>{q.client_name}</div>
        <div className="text-[12px] mt-1 truncate" style={{ color: 'var(--nm-text-muted)' }}>{meta}</div>
      </div>
      <div className="w-[150px] shrink-0 text-right">
        {missing > 0 ? (
          <span className="inline-block text-[11.5px] font-medium px-2.5 py-1 rounded-full" style={{ border: '1.5px solid rgba(217,181,107,.55)', color: 'var(--nm-warning-glass-text)' }}>
            {missing} 項待補價
          </span>
        ) : (
          <span className={`nm-pill ${QUOTE_STATUS_PILL_CLASS[q.status]}`} style={QUOTE_STATUS_PILL_STYLE[q.status]}>
            {QUOTE_STATUS_LABEL[q.status]}
          </span>
        )}
      </div>
      <div className="w-[130px] shrink-0 text-right text-[14px] font-medium tabular-nums" style={{ color: 'var(--nm-text-body)' }}>
        {lineCount === 0 ? <span style={{ color: 'var(--nm-text-muted)' }}>—</span> : `$${fmt(total)}`}
      </div>
      <div className="w-[88px] shrink-0 text-right text-[12px] tabular-nums" style={{ color: 'var(--nm-text-faint)' }}>{dateLabel}</div>
    </Link>
  );
}
