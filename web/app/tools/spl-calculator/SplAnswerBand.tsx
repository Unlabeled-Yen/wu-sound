function fmt(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(digits);
}

// 答案帶:答案先行,原本在表單最下面的距離數字搬到最上面獨佔最大字級。
// 距離尺把「建議可用範圍(實心)／理論可達但無餘裕(空心)」畫成軌道,取代原本
// 純文字的「理論最大 18.8m」——尺度用理論距離的 1.35 倍當右端,兩者維持相近比例。
export function SplAnswerBand({
  recommendedM, theoreticalM, budgetDb, refDistanceM,
  checkDistanceM, checkAttenuationDb, checkPasses,
}: {
  recommendedM: number;
  theoreticalM: number;
  budgetDb: number;
  refDistanceM: number;
  checkDistanceM: number | null;
  checkAttenuationDb: number | null;
  checkPasses: boolean | null;
}) {
  const chartMaxM = Math.max(theoreticalM * 1.35, (checkDistanceM ?? 0) * 1.15, refDistanceM * 4);
  const pct = (m: number) => Math.max(0, Math.min(100, (m / chartMaxM) * 100));
  const recommendedPct = pct(recommendedM);
  const theoreticalPct = pct(theoreticalM);
  const checkPct = checkDistanceM !== null ? pct(checkDistanceM) : null;
  const margin = checkAttenuationDb !== null ? budgetDb - checkAttenuationDb : null;

  return (
    <div className="rounded-[20px] nm-raised-sm px-6 py-6">
      <div className="flex flex-wrap items-end gap-10 mb-6">
        <div>
          <div className="text-[12.5px] mb-3" style={{ color: 'var(--nm-text-muted)' }}>建議最遠投射距離(理論值 9 折)</div>
          <div className="flex items-baseline gap-2">
            <span className="tabular-nums text-[34px] lg:text-[46px]" style={{ fontWeight: 600, lineHeight: 1, color: 'var(--nm-success-glass-text)', textShadow: '0 1px 3px rgba(0,0,0,.65)' }}>{fmt(recommendedM)}</span>
            <span style={{ fontSize: 18, color: 'var(--nm-success)' }}>m</span>
          </div>
        </div>
        <div className="pb-1">
          <div className="text-[12px] mb-2.5" style={{ color: 'var(--nm-text-muted)' }}>理論最大</div>
          <div className="text-xl font-medium" style={{ color: 'var(--nm-text-body)' }}>{fmt(theoreticalM)} m</div>
        </div>
        <div className="pb-1">
          <div className="text-[12px] mb-2.5" style={{ color: 'var(--nm-text-muted)' }}>距離衰減預算</div>
          <div className="text-xl font-medium" style={{ color: 'var(--nm-text-body)' }}>{fmt(budgetDb)} dB</div>
        </div>
        <div className="flex-1" />
        {checkDistanceM !== null && checkAttenuationDb !== null && margin !== null && (
          <div
            className="flex items-center gap-2.5 px-4 py-3 rounded-[13px]"
            style={
              checkPasses
                ? { background: 'rgba(126,207,157,.16)', border: '1px solid rgba(126,207,157,.4)' }
                : { background: 'rgba(224,122,122,.14)', border: '1px solid rgba(224,122,122,.4)' }
            }
          >
            <span className="text-[13px] font-semibold" style={{ color: checkPasses ? 'var(--nm-success-glass-text)' : 'var(--nm-danger-glass-text)' }}>
              驗算 {fmt(checkDistanceM, 0)} m:{checkPasses ? `達標,還餘 ${fmt(margin)} dB` : `超出預算 ${fmt(-margin)} dB,不達標`}
            </span>
          </div>
        )}
      </div>

      {/* 距離尺:實心＝建議可用範圍,空心＝理論可達但已無餘裕——幾何編碼,不是純色差。 */}
      <div style={{ position: 'relative', height: 74 }}>
        <div className="flex" style={{ position: 'absolute', left: 0, right: 0, top: 26, height: 18, borderRadius: 3, background: 'rgba(255,255,255,.05)', overflow: 'hidden' }}>
          <div style={{ width: `${recommendedPct}%`, background: 'rgba(126,207,157,.75)' }} />
          <div style={{ width: `${Math.max(0, theoreticalPct - recommendedPct)}%`, background: 'rgba(217,181,107,.3)', borderTop: '1.5px solid var(--nm-warning)', borderBottom: '1.5px solid var(--nm-warning)', borderRight: '1.5px solid var(--nm-warning)' }} />
        </div>
        {checkPct !== null && checkDistanceM !== null && (
          <>
            <div style={{ position: 'absolute', left: `${checkPct}%`, top: 14, bottom: 16, width: 2, background: '#a068d5' }} />
            <div style={{ position: 'absolute', left: `${checkPct}%`, top: 0, transform: 'translateX(-50%)', fontSize: 11, fontWeight: 600, color: '#c39ae8', whiteSpace: 'nowrap' }}>觀眾最遠點 {fmt(checkDistanceM, 0)} m</div>
          </>
        )}
        {/* 兩個標籤中心距太近(窄螢幕常見)會疊字,改成上下錯開,不是硬擠在同一行。 */}
        <div style={{ position: 'absolute', left: `${recommendedPct}%`, top: 50, transform: 'translateX(-50%)', fontSize: 10.5, fontWeight: 600, color: 'var(--nm-success-glass-text)', whiteSpace: 'nowrap' }}>建議 {fmt(recommendedM)}</div>
        <div style={{ position: 'absolute', left: `${theoreticalPct}%`, top: theoreticalPct - recommendedPct < 8 ? 64 : 50, transform: 'translateX(-50%)', fontSize: 10.5, color: 'var(--nm-warning-glass-text)', whiteSpace: 'nowrap' }}>理論 {fmt(theoreticalM)}</div>
        <div style={{ position: 'absolute', left: 0, top: 50, fontSize: 10.5, color: 'var(--nm-text-faint)' }}>基準 {fmt(refDistanceM, 0)} m</div>
        <div style={{ position: 'absolute', right: 0, top: 50, fontSize: 10.5, color: 'var(--nm-text-faint)' }}>{fmt(chartMaxM, 0)} m</div>
      </div>
      <div className="text-[11.5px] leading-[1.7] mt-3" style={{ color: 'var(--nm-text-muted)' }}>
        實心＝建議可用範圍　·　空心＝理論可達但已無餘裕　·　紫線＝目前驗算的觀眾距離
      </div>
    </div>
  );
}
