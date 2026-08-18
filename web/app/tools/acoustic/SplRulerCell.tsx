function fmt(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(digits);
}

// SPL 帶距離尺格(§3-2):flex:1。尺度固定 0–24 m,每個百分比 = 值/24*100,
// 禁止硬編碼——recommendedM/theoreticalM/checkDistanceM 都經同一函式換算。
// 版面對照 screens/16-acoustic-merged-21a.png:頂列「距離尺 0–24 M」+ 圖例,
// 軌道置中,底列「基準/建議/理論/24m」四個端點標籤。
const SCALE_MAX = 24;
const pct = (m: number) => Math.max(0, Math.min(100, (m / SCALE_MAX) * 100));

export function SplRulerCell({
  recommendedM, theoreticalM, checkDistanceM, refDistanceM,
}: {
  recommendedM: number;
  theoreticalM: number;
  checkDistanceM: number | null;
  refDistanceM: number;
}) {
  const solidPct = pct(recommendedM);
  const hollowLeftPct = pct(recommendedM);
  const hollowWidthPct = Math.max(0, pct(theoreticalM) - pct(recommendedM));
  const theoreticalPct = pct(theoreticalM);
  const checkPct = checkDistanceM !== null ? pct(checkDistanceM) : null;

  return (
    <div className="flex-1 min-w-0 flex flex-col justify-between" style={{ borderLeft: '1px solid rgba(255,255,255,.08)', paddingLeft: 20 }}>
      <div style={{ font: '400 9.5px/1.4 "Noto Sans TC",sans-serif', color: '#5a5b60', whiteSpace: 'nowrap' }}>
        距離尺 0–{SCALE_MAX} m　·　<span style={{ color: '#5fc9bf' }}>實心＝建議可用</span>　·　<span style={{ color: '#d9b56b' }}>空心＝無餘裕</span>　·　<span style={{ color: '#c39ae8' }}>紫線＝驗算距離</span>
      </div>

      <div className="relative" style={{ height: 30 }}>
        <div className="absolute" style={{ left: 0, right: 0, top: 7, height: 16, borderRadius: 3, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', overflow: 'hidden' }}>
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
              style={{ left: `${checkPct}%`, top: 0, width: 3, height: 30, background: '#a068d5', boxShadow: '0 0 8px rgba(160,104,213,.6)' }}
            />
            <span
              className="absolute"
              style={{ left: `${checkPct}%`, top: -13, transform: 'translateX(-50%)', background: '#0b0b0d', padding: '2px 6px', font: '500 9.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace', color: '#c39ae8', whiteSpace: 'nowrap' }}
            >
              {fmt(checkDistanceM, 0)} m
            </span>
          </>
        )}
      </div>

      {/* 建議/理論常常算出遠超過 24m 尺度(例如還沒選喇叭、預設最大音壓 136dB 時)——
          pct() 會把它們夾在 100%,跟右端「24 m」擠在同一個點。這種離尺情況就不
          個別標數字,軌道本身已經整條實心/空心到底,不需要標籤重複講一次。 */}
      <div className="relative tabular-nums" style={{ height: 12, font: '400 10.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace' }}>
        <span className="absolute" style={{ left: 0, color: '#6d6e73' }}>基準 {fmt(refDistanceM, 0)}</span>
        {solidPct < 94 && (
          <span className="absolute" style={{ left: `${solidPct}%`, transform: 'translateX(-50%)', color: '#7fd8cd' }}>建議 {fmt(recommendedM)}</span>
        )}
        {theoreticalPct < 94 && theoreticalPct - solidPct > 4 && (
          <span className="absolute" style={{ left: `${theoreticalPct}%`, transform: 'translateX(-50%)', color: '#e7ca8c' }}>理論 {fmt(theoreticalM)}</span>
        )}
        <span className="absolute" style={{ right: 0, color: '#6d6e73' }}>{fmt(SCALE_MAX, 0)} m</span>
      </div>
    </div>
  );
}
