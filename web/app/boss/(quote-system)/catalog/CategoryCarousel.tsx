'use client';

import { useEffect, useRef, useState } from 'react';
import type { CatalogItem } from '@/lib/types';
import CatalogRow from './CatalogRow';

export interface CarouselPanel {
  key: string;
  title: string;
  hint?: string;
  items: CatalogItem[];
  tone?: 'warning';
}

const SWIPE_THRESHOLD = 48;

export default function CategoryCarousel({ panels }: { panels: CarouselPanel[] }) {
  const [index, setIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const touchDeltaX = useRef(0);

  useEffect(() => {
    if (index > panels.length - 1) setIndex(Math.max(0, panels.length - 1));
  }, [panels.length, index]);

  if (panels.length === 0) return null;

  const clamp = (i: number) => Math.max(0, Math.min(panels.length - 1, i));
  const go = (i: number) => setIndex(clamp(i));

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchDeltaX.current = 0;
  }
  function onTouchMove(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    touchDeltaX.current = e.touches[0].clientX - touchStartX.current;
  }
  function onTouchEnd() {
    if (Math.abs(touchDeltaX.current) > SWIPE_THRESHOLD) {
      go(index + (touchDeltaX.current < 0 ? 1 : -1));
    }
    touchStartX.current = null;
    touchDeltaX.current = 0;
  }

  const showChrome = panels.length > 1;

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2.5">
      {showChrome && (
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => go(index - 1)}
            disabled={index === 0}
            className="nm-btn nm-focus shrink-0"
            style={{ minHeight: 0, padding: '8px 10px' }}
            aria-label="上一個分類"
          >
            <ChevronIcon direction="left" />
          </button>

          <div className="flex-1 min-w-0 overflow-x-auto app-scroll">
            <div className="flex items-center gap-1.5 w-max py-0.5">
              {panels.map((p, i) => {
                const active = i === index;
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => go(i)}
                    aria-current={active ? 'true' : undefined}
                    className={`nm-pill whitespace-nowrap nm-focus ${active ? 'nm-pill-neutral' : 'nm-pill-muted'}`}
                    style={{
                      cursor: 'pointer',
                      color: active ? 'var(--nm-text-primary)' : undefined,
                      borderColor: active ? 'var(--nm-border-glass)' : undefined,
                    }}
                  >
                    {p.title}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={() => go(index + 1)}
            disabled={index === panels.length - 1}
            className="nm-btn nm-focus shrink-0"
            style={{ minHeight: 0, padding: '8px 10px' }}
            aria-label="下一個分類"
          >
            <ChevronIcon direction="right" />
          </button>
        </div>
      )}

      <div
        className="flex-1 min-h-0 overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="h-full flex carousel-track"
          style={{
            width: `${panels.length * 100}%`,
            transform: `translateX(-${index * (100 / panels.length)}%)`,
          }}
        >
          {panels.map((p) => (
            <div key={p.key} className="h-full min-h-0" style={{ width: `${100 / panels.length}%` }}>
              <CategoryPanel title={p.title} hint={p.hint} items={p.items} tone={p.tone} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CategoryPanel({ title, hint, items, tone }: Omit<CarouselPanel, 'key'>) {
  const titleColor = tone === 'warning' ? 'var(--nm-warning)' : 'var(--nm-text-primary)';
  return (
    <section className="h-full min-h-0 flex flex-col rounded-2xl nm-raised overflow-hidden">
      <header className="flex items-center gap-2 px-3.5 py-2.5 shrink-0">
        <h2 className="text-sm font-semibold" style={{ color: titleColor }}>
          {title}
        </h2>
        {hint && (
          <span className="text-[11px]" style={{ color: 'var(--nm-text-muted)' }}>
            {hint}
          </span>
        )}
      </header>
      <div className="flex-1 min-h-0 px-2 pb-2">
        <div className="h-full overflow-y-auto overflow-x-auto app-scroll">
          <table className="w-full text-[13.5px]" style={{ minWidth: 780, borderCollapse: 'collapse' }}>
            <thead
              className="sticky top-0 z-10"
              style={{ background: 'rgba(20,20,24,0.92)' }}
            >
              <tr style={{ color: 'var(--nm-text-muted)' }}>
                <th className="text-left px-3.5 py-2.5 font-normal text-[11px] leading-none tracking-[.14em] whitespace-nowrap">品牌</th>
                <th className="text-left px-3.5 py-2.5 font-normal text-[11px] leading-none tracking-[.14em] whitespace-nowrap">品名</th>
                <th className="text-left px-3.5 py-2.5 font-normal text-[11px] leading-none tracking-[.14em] whitespace-nowrap">類型</th>
                <th className="text-left px-3.5 py-2.5 font-normal text-[11px] leading-none tracking-[.14em] whitespace-nowrap">單位</th>
                <th className="text-right px-3.5 py-2.5 font-normal text-[11px] leading-none tracking-[.14em] whitespace-nowrap">進價</th>
                <th className="text-right px-3.5 py-2.5 font-normal text-[11px] leading-none tracking-[.14em] whitespace-nowrap">售價</th>
                <th className="text-left px-3.5 py-2.5 font-normal text-[11px] leading-none tracking-[.14em] whitespace-nowrap">分類</th>
                <th className="text-right px-5 py-2.5 font-normal text-[11px] leading-none tracking-[.14em] whitespace-nowrap">動作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <CatalogRow key={item.id} item={item} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  const d = direction === 'left' ? 'M15 18l-6-6 6-6' : 'M9 6l6 6-6 6';
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}
