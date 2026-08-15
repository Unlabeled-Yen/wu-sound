// 訊號列(05-tender-watch.md §2)。四格等寬,每格都是篩選入口。
// 格 1/2 用當期 hits 現算(七日內截止、今日新進)。
// 格 3(對手價格異動):需要對手投標歷史 diff,tender-radar 沒接,顯示「尚未接上」。
// 格 4(越線警報):近 7 天決標中,award/base < 0.86 的件數。由 /api/signals/breaches 供,
// 見 07-視覺校正指南 §3.4 訊號列規則「越線警報 = 對手殺到底價 86% 以下」。

import { daysLeft, todayInTaipei, buildHref, type TenderHit } from './shared';

interface Props {
  hits: TenderHit[];
  days: number;
  price: string;
  nature: string;
  pool: string;
  urgent: boolean;
  fresh: boolean;
  breachCount: number | null; // null = API failed / not configured
}

function Cell({
  label,
  value,
  sub,
  href,
  active,
  tone = 'default',
}: {
  label: string;
  value: string;
  sub: string;
  href?: string;
  active?: boolean;
  tone?: 'default' | 'warning' | 'danger';
}) {
  const valueColor = tone === 'danger' ? 'var(--nm-danger)'
    : tone === 'warning' ? 'var(--nm-warning-glass-text)'
    : 'var(--nm-text-primary)';
  const body = (
    <>
      <div className="text-[11px] leading-none uppercase" style={{ color: 'var(--nm-text-muted)', letterSpacing: '.18em' }}>
        {label}
      </div>
      <div className="mt-1 text-[30px] font-semibold tabular-nums" style={{ color: valueColor }}>
        {value}
      </div>
      <div className="mt-0.5 text-[11px] leading-[1.6]" style={{ color: 'var(--nm-text-muted)' }}>
        {sub}
      </div>
    </>
  );

  if (!href) {
    return (
      <div className="p-3 opacity-50" style={{ cursor: 'not-allowed' }} aria-disabled="true">
        {body}
      </div>
    );
  }

  return (
    <a
      href={href}
      className="block p-3 nm-lift rounded-lg"
      style={active ? { background: 'rgba(217,181,107,0.1)' } : undefined}
    >
      {body}
    </a>
  );
}

export default function SignalRow({ hits, days, price, nature, pool, urgent, fresh, breachCount }: Props) {
  const urgentCount = hits.filter((h) => {
    const d = daysLeft(h);
    return d !== null && d >= 0 && d <= 7;
  }).length;
  const today = todayInTaipei();
  const freshCount = hits.filter((h) => h.publish_date === today).length;

  return (
    <div
      className="grid grid-cols-2 lg:grid-cols-4"
      style={{ background: 'rgba(8,8,10,0.28)', border: '1px solid var(--nm-border-hair)', borderRadius: 16 }}
    >
      <div style={{ borderRight: '1px solid var(--nm-border-hair)' }}>
        <Cell
          label="七日內截止"
          value={String(urgentCount)}
          sub="件待決定投不投"
          href={buildHref({ days, price, nature, pool, urgent: !urgent, fresh })}
          active={urgent}
          tone={urgentCount > 0 ? 'warning' : 'default'}
        />
      </div>
      <div className="lg:border-r" style={{ borderRight: '1px solid var(--nm-border-hair)' }}>
        <Cell
          label="今日新進"
          value={String(freshCount)}
          sub="件新公告"
          href={buildHref({ days, price, nature, pool, urgent, fresh: !fresh })}
          active={fresh}
        />
      </div>
      <div className="border-t lg:border-t-0" style={{ borderRight: '1px solid var(--nm-border-hair)', borderColor: 'var(--nm-border-hair)' }}>
        <Cell label="對手價格異動" value="—" sub="資料尚未接上" />
      </div>
      <div className="border-t lg:border-t-0" style={{ borderColor: 'var(--nm-border-hair)' }}>
        {breachCount === null ? (
          <Cell label="越線警報" value="—" sub="查詢失敗" />
        ) : (
          <Cell
            label="越線警報"
            value={String(breachCount)}
            sub="近 7 日決標低於底價 86%"
            tone={breachCount > 0 ? 'danger' : 'default'}
          />
        )}
      </div>
    </div>
  );
}
