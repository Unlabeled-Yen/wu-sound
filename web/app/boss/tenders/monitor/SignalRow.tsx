// 訊號列(06-project-board... 不,05-tender-watch.md §2)。四格等寬,每格都是篩選入口。
// 只有格 1/2 有真數字——格 3/4(對手價格異動、越線警報)需要 tender-radar 目前沒有的
// 逐廠商行為異動/決標比率門檻資料,標「資料尚未接上」,刻意不上色(見 shared.ts 頂部
// 或 globals.css 的 --nm-breach 註解:顏色代表真事件,佔位格沒有事件可講)。

import { daysLeft, todayInTaipei, buildHref, type TenderHit } from './shared';

interface Props {
  hits: TenderHit[];
  days: number;
  price: string;
  nature: string;
  pool: string;
  urgent: boolean;
  fresh: boolean;
}

function Cell({
  label,
  value,
  sub,
  href,
  active,
}: {
  label: string;
  value: string;
  sub: string;
  href?: string;
  active?: boolean;
}) {
  const body = (
    <>
      <div className="text-[10px] uppercase" style={{ color: 'var(--nm-text-muted)', letterSpacing: '.18em' }}>
        {label}
      </div>
      <div className="mt-1 text-[30px] font-semibold tabular-nums" style={{ color: 'var(--nm-text-primary)' }}>
        {value}
      </div>
      <div className="mt-0.5 text-xs" style={{ color: 'var(--nm-text-muted)' }}>
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
      style={active ? { background: 'rgba(224,179,80,0.1)' } : undefined}
    >
      {body}
    </a>
  );
}

export default function SignalRow({ hits, days, price, nature, pool, urgent, fresh }: Props) {
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
        <Cell label="越線警報" value="—" sub="資料尚未接上" />
      </div>
    </div>
  );
}
