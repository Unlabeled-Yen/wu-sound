import { fetchTenderRadar } from '@/lib/tender-radar';

// 對手檔案(07-視覺校正指南 §3.4-5)。長條=最近一次決標的 決標/底價 比例,
// 白色 1px 刻=該對手 12 個月平均——落差就是「行為改變」。這裡沒有 Wu 手動
// 維護的對手名單(tender-radar 的 competitors 表是空的),對手候選是市場
// 決標紀錄自動算出的「音響類決標次數最高的公司」,不是特別針對 Wu 的名單,
// 見 tender-radar/packages/radar/src/rival-dossier.ts 頂部註解。

interface CompetitorProfile {
  key: string;
  name: string;
  awardCount: number;
  latest: { awardDate: string; ratio: number } | null;
  twelveMonthAvgRatio: number | null;
  twelveMonthSampleN: number;
}

interface RivalsResponse {
  domain: string;
  competitors: CompetitorProfile[];
}

function pct(ratio: number): number {
  return Math.max(0, Math.min(100, ratio * 100));
}

function RivalRow({ c }: { c: CompetitorProfile }) {
  const latestPct = c.latest ? pct(c.latest.ratio) : 0;
  const avgPct = c.twelveMonthAvgRatio !== null ? pct(c.twelveMonthAvgRatio) : null;
  const changed = avgPct !== null && Math.abs(latestPct - avgPct) >= 5;

  return (
    <li className="py-2.5" style={{ borderTop: '1px solid var(--nm-border-hair)' }}>
      <div className="mb-1.5 flex flex-wrap items-baseline gap-2">
        <span className="text-[13px] font-medium truncate" style={{ color: 'var(--nm-text-primary)' }}>
          {c.name}
        </span>
        <span className="text-[11px] leading-none tracking-[.14em]" style={{ color: 'var(--nm-text-faint)' }}>
          近 3 年 {c.awardCount} 標
        </span>
        {c.latest && (
          <span className="ml-auto tabular-nums text-[12px] leading-[1.6]" style={{ color: changed ? 'var(--nm-warning-glass-text)' : 'var(--nm-text-secondary)' }}>
            最近一標 {c.latest.awardDate} · {Math.round(c.latest.ratio * 100)}%
          </span>
        )}
      </div>
      <div className="relative h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${latestPct}%`, background: changed ? 'var(--nm-warning)' : 'var(--nm-text-muted)' }}
        />
        {avgPct !== null && (
          <div
            className="absolute top-0 h-full"
            style={{ left: `${avgPct}%`, width: 1, background: '#fff' }}
            title={`12 個月平均 ${Math.round(avgPct)}%`}
          />
        )}
      </div>
    </li>
  );
}

export default async function RivalDossier() {
  const { data, error } = await fetchTenderRadar<RivalsResponse>('/api/market/rivals?limit=6');
  const competitors = data?.competitors ?? [];

  return (
    <section className="rounded-2xl nm-raised p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold" style={{ color: 'var(--nm-text-primary)' }}>對手檔案</h2>
        <span className="text-[11px] leading-none tracking-[.14em]" style={{ color: 'var(--nm-text-faint)' }}>音響類 · 決標次數排序</span>
      </div>

      {error && !data ? (
        <p className="mt-2 text-[12px] leading-[1.6]" style={{ color: 'var(--nm-text-muted)' }}>對手檔案尚未接上</p>
      ) : competitors.length === 0 ? (
        <p className="mt-2 text-[12px] leading-[1.6]" style={{ color: 'var(--nm-text-muted)' }}>市場資料不足,還算不出對手排名</p>
      ) : (
        <>
          <ul>
            {competitors.map((c) => <RivalRow key={c.key} c={c} />)}
          </ul>
          <p className="mt-3 text-[12px] leading-[1.6]" style={{ color: 'var(--nm-text-muted)' }}>
            長條是最近一次決標的決標/底價比例,白刻是該對手 12 個月平均——落差就是對手最近的行為改變。名單由音響類決標次數自動排序,不是 Wu 手動認定的對手清單。
          </p>
        </>
      )}
    </section>
  );
}
