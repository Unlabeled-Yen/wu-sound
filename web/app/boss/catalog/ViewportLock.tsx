'use client';

import { useLayoutEffect, useRef, useState } from 'react';

// BossShell's content wrapper (`main > div.flex-1.overflow-auto`) is itself
// `overflow-auto` inside a shell whose outer container only has `min-h-screen`
// (not a hard viewport cap) — so if our subtree's natural content height is
// taller than the viewport, CSS flexbox auto-sizing grows the *whole* shell
// to fit it (page-level scroll) instead of clipping at the content div.
// Percentage heights (`h-full`) can't escape that, since the ancestor chain
// never becomes "definite" until content is already sized.
//
// Instead we measure our own distance from the top of the viewport at runtime
// and size ourselves to exactly fill the remaining space, independent of how
// the ancestor chain resolves its own auto-height. This keeps BossShell (and
// every other boss/* page that relies on normal page-level scroll) untouched.

// Space still needed below this element inside BossShell's content div/shell:
// content div's own bottom padding (pb-8 = 32px) + shell's outer bottom
// padding (p-3.5 = 14px).
const BOTTOM_GUTTER = 32 + 14;
const MIN_HEIGHT = 280;

export default function ViewportLock({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    function measure() {
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      const available = window.innerHeight - top - BOTTOM_GUTTER;
      setHeight(Math.max(MIN_HEIGHT, Math.floor(available)));
    }

    measure();
    window.addEventListener('resize', measure);
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);

    return () => {
      window.removeEventListener('resize', measure);
      ro.disconnect();
    };
  }, []);

  return (
    <div
      ref={ref}
      className="flex flex-col gap-3 overflow-hidden"
      style={{ height: height ?? undefined, maxHeight: height ?? '70vh' }}
    >
      {children}
    </div>
  );
}
