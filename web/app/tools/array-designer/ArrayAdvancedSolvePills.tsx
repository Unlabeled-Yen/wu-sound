const TABS = [
  { key: 'auto', label: 'Auto Mode' },
  { key: 'quantity', label: 'Quantity' },
  { key: 'unity', label: 'Unity' },
  { key: 'spacing', label: 'Spacing' },
  { key: 'splay', label: 'Splay' },
] as const;

export type TabKey = (typeof TABS)[number]['key'];

// 進階求解:Auto Mode 是預設主畫面,四個單項求解降為這排 pill 裡的入口——
// 原型只畫了四個進階 pill(沒有 Auto 本身),但拿掉回到 Auto 的路徑會讓使用者
// 卡住,所以多留一顆「Auto Mode」pill 當預設高亮/返回口,不是額外加功能。
// 五個分頁仍全部保持掛載,切換不清空各自狀態(規格 B-06 不變)。
export function ArrayAdvancedSolvePills({ active, onChange }: { active: TabKey; onChange: (key: TabKey) => void }) {
  return (
    <div className="flex flex-wrap lg:flex-nowrap items-center gap-3.5 rounded-[20px] nm-raised" style={{ padding: '16px 20px' }}>
      <div className="text-[12.5px] shrink-0" style={{ color: 'var(--nm-text-secondary)' }}>進階求解</div>
      <div className="flex gap-2 overflow-x-auto lg:flex-wrap w-full lg:w-auto pb-1 lg:pb-0">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className="text-[12.5px] shrink-0"
            style={
              active === t.key
                ? { padding: '7px 14px', borderRadius: 999, background: '#f0f0f2', color: '#17171a', fontWeight: 500 }
                : { padding: '7px 14px', borderRadius: 999, background: 'rgba(40,40,46,.4)', border: '1px solid rgba(255,255,255,.2)', color: '#cfcfd2' }
            }
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1" />
      <div className="text-[11.5px] leading-[1.7] max-w-[330px]" style={{ color: 'var(--nm-text-muted)' }}>
        Auto Mode 回答九成場合,四個單項求解降為進階入口(狀態仍全部保留不清空)。
      </div>
    </div>
  );
}
