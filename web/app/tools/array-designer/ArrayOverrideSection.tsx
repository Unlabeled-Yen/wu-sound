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
    <div>
      <div className="text-[12px] mb-1.5" style={{ color: 'var(--nm-text-secondary)' }}>
        {label}{!isAuto && <span className="ml-2" style={{ color: 'var(--nm-warning-glass-text)' }}>已覆寫</span>}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onAuto}
          className="shrink-0 text-[12px] font-medium"
          style={
            isAuto
              ? { minHeight: 36, padding: '0 12px', borderRadius: 13, background: '#f0f0f2', color: '#17171a' }
              : { minHeight: 36, padding: '0 12px', borderRadius: 13, background: 'rgba(40,40,46,.4)', border: '1px solid rgba(255,255,255,.2)', color: '#cfcfd2' }
          }
        >
          Auto
        </button>
        <div
          className="flex-1 min-w-0 flex items-center justify-between gap-2"
          style={{
            minHeight: 40, borderRadius: 13, padding: '0 14px', background: 'rgba(8,8,10,.5)',
            border: isAuto ? '1px solid rgba(255,255,255,.13)' : '1.5px solid rgba(217,181,107,.55)',
          }}
        >
          <input
            type="number"
            inputMode="decimal"
            className="flex-1 min-w-0 bg-transparent text-[13px] outline-none"
            style={{ color: 'var(--nm-text-body)' }}
            value={displayValue}
            onChange={(e) => onOverrideChange(e.target.value)}
          />
          {/* 被覆寫時顯示系統值 ghost——讓使用者知道自己偏離了多少,不用切回 Auto 再切回來比對。 */}
          {!isAuto && systemValue !== null && (
            <span className="shrink-0 text-[11.5px]" style={{ color: 'var(--nm-text-muted)' }}>系統 {fmt(systemValue)}</span>
          )}
        </div>
        <span className="shrink-0 text-[12.5px]" style={{ color: 'var(--nm-text-muted)' }}>{unit}</span>
      </div>
    </div>
  );
}

// 現場覆寫:吊點只能整數米、支數固定時,直接改系統建議值;系統值以淡色留在
// 原位(ghost),按 Auto 交還。被覆寫的欄位加 1.5px 黃色描邊,標題旁標「已覆寫」。
export function ArrayOverrideSection({
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
  return (
    <div className="rounded-[20px] nm-raised" style={{ padding: '20px 22px' }}>
      <div className="text-[15px] font-semibold mb-1.5" style={{ color: 'var(--nm-text-primary)' }}>現場覆寫</div>
      <div className="text-[12px] leading-[1.7] mb-4.5" style={{ color: 'var(--nm-text-secondary)', marginBottom: 18 }}>
        吊點只能整數米、支數固定時,直接改;系統值以淡色留在原位,按 Auto 交還。
      </div>
      <div className="grid gap-3.5">
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
