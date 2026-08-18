// 現場覆寫(16-acoustic-merged.md §4-3)。狀態機不動(spacingOverride/qtyOverride
// 為 null＝Auto)——這裡只是把 ArrayOverrideSection 的版面換成併頁的緊湊格式:
// 「已覆寫」badge 只在真的有覆寫時顯示;被覆寫的欄位加金色描邊,右側顯示系統值 ghost。
function fmt(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(digits);
}

function OverrideRow({
  label, unit, systemValue, isAuto, overrideText, onOverrideChange, onAuto,
}: {
  label: string;
  unit: string;
  systemValue: number | null;
  isAuto: boolean;
  overrideText: string;
  onOverrideChange: (v: string) => void;
  onAuto: () => void;
}) {
  const displayValue = isAuto ? (systemValue !== null ? fmt(systemValue) : '') : overrideText;
  return (
    <div className="flex items-center gap-[7px]">
      <span className="flex-none" style={{ width: 34, font: '400 10.5px/1 "Noto Sans TC",sans-serif', color: '#8a8b90' }}>{label}</span>
      <button
        type="button"
        onClick={onAuto}
        className="flex-none"
        style={
          isAuto
            ? { padding: '3px 8px', borderRadius: 6, background: '#f0f0f2', color: '#17171a', font: '500 9.5px/1.3 "Noto Sans TC",sans-serif' }
            : { padding: '3px 8px', borderRadius: 6, background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.13)', color: '#8a8b90', font: '400 9.5px/1.3 "Noto Sans TC",sans-serif' }
        }
      >
        Auto
      </button>
      <div
        className="flex-1 min-w-0 flex items-center justify-between gap-2"
        style={{
          minHeight: 26, borderRadius: 6, padding: '0 8px', background: 'rgba(8,8,10,.5)',
          border: isAuto ? '1px solid rgba(255,255,255,.11)' : '1.5px solid #d9b56b',
        }}
      >
        <input
          type="number"
          inputMode="decimal"
          className="flex-1 min-w-0 bg-transparent outline-none"
          style={{ font: '400 10.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace', color: '#e4e4e7' }}
          value={displayValue}
          onChange={(e) => onOverrideChange(e.target.value)}
        />
        {!isAuto && systemValue !== null && (
          <span className="flex-none" style={{ font: '400 9.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace', color: '#6d6e73' }}>系統 {fmt(systemValue)}</span>
        )}
      </div>
    </div>
  );
}

export function ArrayOverrideCompact({
  autoQuantity, autoSpacingM,
  qtyOverride, setQtyOverride, spacingOverride, setSpacingOverride,
}: {
  autoQuantity: number | null;
  autoSpacingM: number | null;
  qtyOverride: string | null;
  setQtyOverride: (v: string | null) => void;
  spacingOverride: string | null;
  setSpacingOverride: (v: string | null) => void;
}) {
  const hasOverride = qtyOverride !== null || spacingOverride !== null;
  return (
    <div className="flex-none rounded-xl" style={{ background: 'rgba(19,19,23,.6)', border: '1px solid rgba(255,255,255,.13)', padding: '12px 13px' }}>
      <div className="flex items-center justify-between mb-[9px]">
        <span className="uppercase" style={{ font: '400 10px/1 "Noto Sans TC",sans-serif', letterSpacing: '.16em', color: '#6d6e73' }}>現場覆寫</span>
        {hasOverride && (
          <span style={{ padding: '2px 7px', borderRadius: 5, background: 'rgba(217,181,107,.14)', border: '1px solid rgba(217,181,107,.34)', font: '400 9.5px/1.3 "Noto Sans TC",sans-serif', color: '#e7ca8c' }}>已覆寫</span>
        )}
      </div>
      <div className="flex flex-col gap-[6px]">
        <OverrideRow
          label="數量" unit="支" systemValue={autoQuantity}
          isAuto={qtyOverride === null} overrideText={qtyOverride ?? ''}
          onOverrideChange={(v) => setQtyOverride(v)} onAuto={() => setQtyOverride(null)}
        />
        <OverrideRow
          label="間距" unit="m" systemValue={autoSpacingM}
          isAuto={spacingOverride === null} overrideText={spacingOverride ?? ''}
          onOverrideChange={(v) => setSpacingOverride(v)} onAuto={() => setSpacingOverride(null)}
        />
      </div>
    </div>
  );
}
