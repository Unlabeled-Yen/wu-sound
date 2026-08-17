function fmt(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(digits);
}

// SPL 帶距離尺格(§3-2):flex:1。尺度固定 0–24 m,每個百分比 = 值/24*100,
// 禁止硬編碼——recommendedM/theoreticalM/checkDistanceM 都經同一函式換算。
const SCALE_MAX = 24;
const pct = (m: number) => Math.max(0, Math.min(100, (m / SCALE_MAX) * 100));

export function SplRulerCell({
  recommendedM, theoreticalM, checkDistanceM,
}: {
  recommendedM: number;
  theoreticalM: number;
  checkDistanceM: number | null;
}) {
  const solidPct = pct(recommendedM);
  const hollowLeftPct = pct(recommendedM);
  const hollowWidthPct = Math.max(0, pct(theoreticalM) - pct(recommendedM));
  const checkPct = checkDistanceM !== null ? pct(checkDistanceM) : null;

  return (
    <div className="flex-1 min-w-0 relative" style={{ borderLeft: '1px solid rgba(255,255,255,.08)', paddingLeft: 20 }}>
      <div className="absolute" style={{ left: 20, right: 0, top: 9, height: 16, borderRadius: 3, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', overflow: 'hidden' }}>
        <div className="absolute" style={{ left: 0, top: 0, bottom: 0, width: `${solidPct}%`, background: 'rgba(95,201,191,.5)' }} />
        {hollowWidthPct > 0 && (
          <div className="absolute" style={{ left: `${hollowLeftPct}%`, top: 0, bottom: 0, width: `${hollowWidthPct}%`, border: '1.5px solid #d9b56b', background: 'rgba(217,181,107,.14)' }} />
        )}
      </div>
      {checkPct !== null && checkDistanceM !== null && (
        <>
          <div
            className="absolute"
            data-ruler-mark
            data-value={checkDistanceM}
            style={{ left: `calc(20px + ${checkPct}%)`, top: 5, width: 3, height: 30, background: '#a068d5', boxShadow: '0 0 8px rgba(160,104,213,.6)' }}
          />
          <span
            className="absolute"
            style={{ left: `calc(20px + ${checkPct}%)`, top: -4, transform: 'translateX(-50%)', background: '#0b0b0d', padding: '2px 6px', font: '500 9.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace', color: '#c39ae8', whiteSpace: 'nowrap' }}
          >
            驗算 {fmt(checkDistanceM, 0)}
          </span>
        </>
      )}
      <div className="absolute" style={{ left: 20, bottom: -2, font: '400 9.5px/1.55 "Noto Sans TC",sans-serif', color: '#5a5b60' }}>
        <span style={{ color: '#5fc9bf' }}>實心＝建議可用</span>　·　<span style={{ color: '#d9b56b' }}>空心＝無餘裕</span>　·　<span style={{ color: '#c39ae8' }}>紫線＝驗算距離</span>
      </div>
    </div>
  );
}
