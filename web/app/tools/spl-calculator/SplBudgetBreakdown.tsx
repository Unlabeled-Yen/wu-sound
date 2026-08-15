function fmt(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(digits);
}

// 「這 X dB 怎麼來的」——原本藏在 ⓘ InfoTip 裡的算式,直接畫成常駐的三段長條。
// 三段共用同一把尺(有效最大音壓 + 聲道疊加 - 目標音壓 的總可分配量):距離預算
// 實心綠(真的分給距離);演出動態、安全餘裕都是空心——刻意保留、不給距離用,
// 不是損失,幾何編碼(空心)在這裡呼應「這筆額度沒有不見,只是保留住」。
export function SplBudgetBreakdown({
  effectiveMaxSplDb, stereoSumDb, targetSplDb, budgetDb, dynamicHeadroomDb, safetyMarginDb,
}: {
  effectiveMaxSplDb: number;
  stereoSumDb: number;
  targetSplDb: number;
  budgetDb: number;
  dynamicHeadroomDb: number;
  safetyMarginDb: number;
}) {
  const total = budgetDb + dynamicHeadroomDb + safetyMarginDb;
  const pct = (n: number) => (total > 0 ? (Math.max(0, n) / total) * 100 : 0);

  return (
    <div className="rounded-[20px] nm-raised px-6" style={{ paddingTop: 22, paddingBottom: 22 }}>
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <div className="text-[15px] font-semibold" style={{ color: 'var(--nm-text-primary)' }}>這 {fmt(budgetDb)} dB 怎麼來的</div>
        <div className="text-[12px]" style={{ color: 'var(--nm-text-faint)' }}>原本藏在 ⓘ 裡的算式,直接畫出來</div>
      </div>
      <div className="text-[12.5px] leading-[1.8] mb-5" style={{ color: 'var(--nm-text-secondary)' }}>
        有效最大音壓 {fmt(effectiveMaxSplDb)} ＋ 聲道疊加 {fmt(stereoSumDb)} － 目標音壓 {fmt(targetSplDb)} ＝ <strong style={{ color: 'var(--nm-text-body)', fontWeight: 600 }}>{fmt(total)} dB</strong> 可分配。
      </div>

      {total > 0 && (budgetDb > 0 || dynamicHeadroomDb > 0 || safetyMarginDb > 0) && (
        <div className="flex mb-3" style={{ gap: 3, height: 34 }}>
          {budgetDb > 0 && (
            <div className="flex items-center px-3 tabular-nums" style={{ width: `${pct(budgetDb)}%`, background: 'rgba(126,207,157,.8)', borderRadius: 3, fontSize: 12.5, fontWeight: 600, color: '#17171a', whiteSpace: 'nowrap', overflow: 'hidden' }}>
              距離預算 {fmt(budgetDb)} dB
            </div>
          )}
          {dynamicHeadroomDb > 0 && (
            <div className="flex items-center px-2.5 tabular-nums" style={{ width: `${pct(dynamicHeadroomDb)}%`, border: '1.5px solid var(--nm-warning)', background: 'rgba(217,181,107,.1)', borderRadius: 3, fontSize: 12, fontWeight: 600, color: 'var(--nm-warning-glass-text)', whiteSpace: 'nowrap', overflow: 'hidden' }}>
              演出動態 {fmt(dynamicHeadroomDb)}
            </div>
          )}
          {safetyMarginDb > 0 && (
            <div className="flex items-center px-2 tabular-nums" style={{ width: `${pct(safetyMarginDb)}%`, border: '1.5px solid #8b8f98', background: 'rgba(139,143,152,.12)', borderRadius: 3, fontSize: 11.5, fontWeight: 600, color: '#b8b8bb', whiteSpace: 'nowrap', overflow: 'hidden' }}>
              安全 {fmt(safetyMarginDb)}
            </div>
          )}
        </div>
      )}

      <div className="text-[11.5px] leading-[1.7]" style={{ color: 'var(--nm-text-muted)' }}>
        動態與安全餘裕是<strong style={{ color: 'var(--nm-text-secondary)', fontWeight: 600 }}>刻意不給距離用的</strong>——空心塊代表保留,不是損失。調整任一格會即時改變上面的距離尺。
      </div>
    </div>
  );
}
