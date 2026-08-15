import type { RatioStats } from './shared';

// 決標價格帶(07-視覺校正指南 §3.4-6)。灰帶=市場區間(min-max)、白刻=中位、
// 100% 參考線=決標剛好等於預算/底價。n<10 整條轉灰標「樣本不足」——這裡沿用
// BasePriceCard 既有的樣本量分級(tier),不是另一套規則:raw/range_median
// 都是 n<10(RatioStats 的 tier 定義見 shared.ts)。
//
// 沒有畫紅/綠刻(我方報價偏離):這幾個字面上要「Wu 這次的報價」跟市場區間
// 比,但這裡是瀏覽中、還沒決定要不要投的標案列表,還沒有一個對應到這張卡
// 的「我方報價」數字可以比——那要等 Wu 真的送出報價才有,不是這張卡能生
// 出來的資料,先不畫假的刻度。

const DOMAIN_MIN = 0.4;
const DOMAIN_MAX = 1.3;
const REF_RATIO = 1; // 決標金額 = 預算/底價 的參考線

function toPct(ratio: number): number {
  return Math.max(0, Math.min(100, ((ratio - DOMAIN_MIN) / (DOMAIN_MAX - DOMAIN_MIN)) * 100));
}

function formatRatioPct(n: number): string {
  const p = Math.round(n * 1000) / 10;
  return `${Number.isInteger(p) ? p : p.toFixed(1)}%`;
}

export function PriceBand({ label, stats }: { label: string; stats: RatioStats }) {
  if (stats.tier === 'none') return null;

  const insufficientSample = stats.tier !== 'quartile'; // n<10

  return (
    <div className="text-[12px] leading-[1.6]">
      <div className="flex items-baseline justify-between gap-2">
        <span style={{ color: 'var(--nm-text-primary)' }}>{label}</span>
        <span className="tabular-nums text-[11px] leading-none tracking-[.14em]" style={{ color: 'var(--nm-text-faint)' }}>
          n={stats.n}
        </span>
      </div>

      <div className="relative mt-1 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.04)' }}>
        <div
          className="absolute inset-y-0"
          style={{ left: `${toPct(REF_RATIO)}%`, width: 1, background: 'rgba(255,255,255,0.18)' }}
        />
        {insufficientSample ? (
          <div className="absolute inset-0 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }} />
        ) : (
          <>
            <div
              className="absolute inset-y-0 rounded-full"
              style={{
                left: `${toPct(stats.min!)}%`,
                width: `${Math.max(1, toPct(stats.max!) - toPct(stats.min!))}%`,
                background: 'rgba(255,255,255,0.18)',
              }}
            />
            <div
              className="absolute inset-y-0"
              style={{ left: `${toPct(stats.median!)}%`, width: 1.5, background: '#fff' }}
              title={`中位 ${formatRatioPct(stats.median!)}`}
            />
          </>
        )}
      </div>

      <div className="mt-0.5" style={{ color: 'var(--nm-text-secondary)' }}>
        {insufficientSample ? (
          stats.tier === 'raw' ? (
            <span>樣本不足 · {stats.ratios!.map(formatRatioPct).join('、')}(僅 {stats.n} 筆,非統計量)</span>
          ) : (
            <span>樣本不足 · 範圍 {formatRatioPct(stats.min!)}–{formatRatioPct(stats.max!)} · 中位 {formatRatioPct(stats.median!)}</span>
          )
        ) : (
          <span>
            範圍 {formatRatioPct(stats.min!)}–{formatRatioPct(stats.max!)} · 中位 {formatRatioPct(stats.median!)}
            {' · '}Q1 {formatRatioPct(stats.q1!)} / Q3 {formatRatioPct(stats.q3!)}
          </span>
        )}
      </div>
    </div>
  );
}
