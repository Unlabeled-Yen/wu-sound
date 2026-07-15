export default function BossLoading() {
  return (
    <div className="flex flex-col gap-4 animate-pulse" aria-live="polite" aria-busy>
      <div className="flex flex-col gap-2">
        <div className="h-3 w-16 rounded" style={{ background: 'rgba(255,255,255,0.06)' }} />
        <div className="h-7 w-40 rounded" style={{ background: 'rgba(255,255,255,0.08)' }} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-2xl nm-raised p-4 flex flex-col gap-3 min-h-[148px]"
          >
            <div className="h-3 w-20 rounded" style={{ background: 'rgba(255,255,255,0.08)' }} />
            <div className="h-8 w-32 rounded" style={{ background: 'rgba(255,255,255,0.10)' }} />
            <div className="h-3 w-40 rounded" style={{ background: 'rgba(255,255,255,0.05)' }} />
          </div>
        ))}
      </div>

      <div className="rounded-2xl nm-raised p-4 flex flex-col gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-4 w-24 rounded" style={{ background: 'rgba(255,255,255,0.07)' }} />
            <div className="h-4 flex-1 rounded" style={{ background: 'rgba(255,255,255,0.04)' }} />
            <div className="h-4 w-16 rounded" style={{ background: 'rgba(255,255,255,0.07)' }} />
          </div>
        ))}
      </div>

      <div className="text-[11px] text-center" style={{ color: 'var(--nm-text-faint)' }}>
        載入中…
      </div>
    </div>
  );
}
