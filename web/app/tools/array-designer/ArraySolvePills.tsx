const TABS = [
  { key: 'auto', label: 'Auto' },
  { key: 'quantity', label: 'Quantity' },
  { key: 'unity', label: 'Unity' },
  { key: 'spacing', label: 'Spacing' },
  { key: 'splay', label: 'Splay' },
] as const;

export type TabKey = (typeof TABS)[number]['key'];

// 進階求解 pill(16-acoustic-merged.md §4-3):原型只畫了四個(沒有 Auto 本身),
// 但拿掉回到 Auto 的路徑會讓使用者卡住,沿用既有 ArrayAdvancedSolvePills 的
// 判斷多留一顆 Auto pill 當預設高亮/返回口——不是額外加功能,是保留必要的出口。
// 五個分頁仍全部保持掛載,切換不清空各自狀態(規格 B-06)。
export function ArraySolvePills({ active, onChange }: { active: TabKey; onChange: (key: TabKey) => void }) {
  return (
    <div className="flex flex-wrap gap-[5px] pt-2">
      {TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          style={
            active === t.key
              ? { padding: '5px 9px', borderRadius: 999, background: '#f0f0f2', color: '#17171a', font: '500 10px/1 "Noto Sans TC",sans-serif' }
              : { padding: '5px 9px', borderRadius: 999, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.11)', color: '#8a8b90', font: '400 10px/1 "Noto Sans TC",sans-serif' }
          }
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
