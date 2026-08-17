// 陣列面板側欄(16-acoustic-merged.md §4-3):條件 / 現場覆寫(選填) / 統計+求解 pill。
// 268px 固定寬,三塊 gap:10。現場覆寫只有 Auto Mode 有(規格 B-06 的覆寫狀態機
// 只存在那個分頁),其餘四個單項求解分頁不傳 overrideSlot,側欄收成兩塊。
export function ArraySidebar({
  conditionsSlot, overrideSlot, stats, pillsSlot,
}: {
  conditionsSlot: React.ReactNode;
  overrideSlot?: React.ReactNode;
  stats: Array<{ label: string; value: string; color: string }>;
  pillsSlot: React.ReactNode;
}) {
  return (
    <div className="flex-none flex flex-col gap-[10px]" style={{ width: 268 }}>
      <div className="flex-none rounded-xl" style={{ background: 'rgba(8,8,10,.4)', border: '1px solid rgba(255,255,255,.11)', padding: '12px 13px' }}>
        <div className="flex items-center justify-between mb-[9px] uppercase" style={{ font: '400 10px/1 "Noto Sans TC",sans-serif', letterSpacing: '.16em', color: '#6d6e73' }}>
          <span>條件</span>
        </div>
        <div className="flex flex-col gap-[5px]">{conditionsSlot}</div>
      </div>

      {overrideSlot}

      <div className="flex-1 min-h-0 rounded-xl flex flex-col justify-between" style={{ background: 'rgba(8,8,10,.4)', border: '1px solid rgba(255,255,255,.11)', padding: '12px 13px' }}>
        <div className="flex flex-col gap-[9px]">
          {stats.map((s) => (
            <div key={s.label} className="flex items-baseline justify-between">
              <span style={{ font: '400 10.5px/1 "Noto Sans TC",sans-serif', color: '#8a8b90' }}>{s.label}</span>
              <span className="tabular-nums" style={{ font: '500 14px/1 ui-monospace,SFMono-Regular,Menlo,monospace', color: s.color }}>{s.value}</span>
            </div>
          ))}
        </div>
        {pillsSlot}
      </div>
    </div>
  );
}

export function ArrayConditionRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center gap-2" style={{ minHeight: 28, padding: '0 9px', borderRadius: 7, background: 'rgba(19,19,23,.6)', border: '1px solid rgba(255,255,255,.1)' }}>
      <span className="flex-1" style={{ font: '400 10.5px/1 "Noto Sans TC",sans-serif', color: '#8a8b90' }}>{label}</span>
      <span className="tabular-nums" style={{ font: '400 10.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace', color: color ?? '#e4e4e7' }}>{value}</span>
    </div>
  );
}

export function ArrayConditionInputRow({
  label, value, onChange, unit, color,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  unit?: string;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-2" style={{ minHeight: 28, padding: '0 9px', borderRadius: 7, background: 'rgba(19,19,23,.6)', border: '1px solid rgba(255,255,255,.1)' }}>
      <span className="flex-1" style={{ font: '400 10.5px/1 "Noto Sans TC",sans-serif', color: '#8a8b90' }}>{label}</span>
      <input
        type="number"
        inputMode="decimal"
        className="tabular-nums bg-transparent outline-none text-right"
        style={{ width: 56, font: '400 10.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace', color: color ?? '#e4e4e7' }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {unit && <span style={{ font: '400 10.5px/1 "Noto Sans TC",sans-serif', color: '#6d6e73' }}>{unit}</span>}
    </div>
  );
}
