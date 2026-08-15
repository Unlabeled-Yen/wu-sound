'use client';

import { useState } from 'react';

// 手機篩選抽屜:規格明講「月份與四個篩選收進右側☰抽屜按鈕(44×44,帶生效數badge)」,
// 不是像桌機一樣整排 select 常駐——窄螢幕擠不下,原型 2b 也是這樣處理。
// 抽屜內容就是同一份 <form method="get">,維持無 JS 也能用(關閉按鈕才需要 JS)。
export function FilterDrawer({ activeCount, activeSummary, children }: {
  activeCount: number;
  activeSummary: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="lg:hidden flex items-center gap-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative shrink-0"
        style={{ width: 44, height: 44, borderRadius: 13, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.17)', color: 'var(--nm-text-body)', fontSize: 15 }}
        aria-label="篩選"
      >
        ☰
        {activeCount > 0 && (
          <span
            className="absolute -top-1 -right-1 tabular-nums"
            style={{ minWidth: 18, height: 18, borderRadius: 999, background: 'var(--nm-warning)', color: '#0f0f11', fontSize: 10, fontWeight: 700, lineHeight: '18px', textAlign: 'center' }}
          >
            {activeCount}
          </span>
        )}
      </button>
      {activeCount > 0 && (
        <span className="text-[11.5px]" style={{ color: 'var(--nm-text-faint)' }}>月份與篩選收在 ☰ 抽屜(目前生效 {activeCount} 項:{activeSummary})</span>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,.6)' }} onClick={() => setOpen(false)} />
          <div className="relative w-[86%] max-w-sm h-full overflow-y-auto p-5" style={{ background: 'var(--nm-bg-deep)', borderLeft: '1px solid var(--nm-border-glass)' }}>
            <div className="flex items-center justify-between mb-4">
              <span className="text-[15px] font-semibold" style={{ color: 'var(--nm-text-primary)' }}>篩選</span>
              <button type="button" onClick={() => setOpen(false)} className="nm-btn" style={{ minHeight: 36, padding: '4px 12px' }}>關閉</button>
            </div>
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
