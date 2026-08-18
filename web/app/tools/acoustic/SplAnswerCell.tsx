function fmt(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(digits);
}

// SPL 帶答案格(16-acoustic-merged.md §3-1):150px 固定寬,justify-content:space-between
// 讓主數字貼上、達標 chip 貼下。含餘裕 dB 是這格跟舊版 SplAnswerBand 的差異——
// 舊版只講「達標/不達標」,併頁把驗算餘裕塞進同一顆 chip 省一行。
export function SplAnswerCell({
  recommendedM, theoreticalM, checkDistanceM, checkPasses, marginDb,
}: {
  recommendedM: number;
  theoreticalM: number;
  checkDistanceM: number | null;
  checkPasses: boolean | null;
  marginDb: number | null;
}) {
  return (
    <div className="flex-none flex flex-col justify-between" style={{ width: 150 }}>
      <div>
        <div className="uppercase" style={{ font: '400 10px/1 "Noto Sans TC",sans-serif', letterSpacing: '.16em', color: '#5fc9bf' }}>SPL 預算</div>
        <div className="flex items-baseline gap-1 mt-2">
          <span className="tabular-nums" style={{ font: '600 34px/1 ui-monospace,SFMono-Regular,Menlo,monospace', color: '#7fd8cd' }}>{fmt(recommendedM)}</span>
          <span style={{ font: '400 13px/1 "Noto Sans TC",sans-serif', color: '#8a8b90' }}>m</span>
        </div>
        <div className="mt-1.5" style={{ font: '400 10.5px/1.4 "Noto Sans TC",sans-serif', color: '#6d6e73' }}>
          建議最遠投射　理論 {fmt(theoreticalM)}
        </div>
      </div>
      {checkDistanceM !== null && marginDb !== null && (
        <div
          className="inline-flex w-fit items-center"
          style={
            checkPasses
              ? { padding: '3px 8px', borderRadius: 7, background: 'rgba(126,207,157,.14)', border: '1px solid rgba(126,207,157,.38)' }
              : { padding: '3px 8px', borderRadius: 7, background: 'rgba(224,122,122,.14)', border: '1px solid rgba(224,122,122,.38)' }
          }
        >
          <span className="tabular-nums" style={{ font: '400 10.5px/1 "Noto Sans TC",sans-serif', color: checkPasses ? '#a9e3c1' : '#e5a0a0' }}>
            {fmt(checkDistanceM, 0)} m {checkPasses ? `達標　餘 ${fmt(marginDb)} dB` : `超出 ${fmt(-marginDb)} dB`}
          </span>
        </div>
      )}
    </div>
  );
}
