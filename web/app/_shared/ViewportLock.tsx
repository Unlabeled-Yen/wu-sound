'use client';

import { useLayoutEffect, useRef, useState } from 'react';

// 把一段內容鎖在「剩下的可用高度」裡:頁面總高度不超過一個視窗,捲動發生在
// 內部的清單而不是整頁。
//
// 為什麼不能只用 CSS:BossShell 外層只有 min-h-screen(沒有硬性視窗上限),
// 子樹一長,flex 就把整個殼撐高變成整頁捲動;百分比高度也逃不掉,因為祖先鏈
// 在內容排版完成前都不是確定高度。只能在執行期自己量。
//
// 量法:往上走每一層祖先,各自算出「這一層允許我延伸到的最低點」
//   = min(這層的底邊, 視窗底) − 這層自己的 padding-bottom
// 取所有層的最小值。padding-bottom 正是版面用來替固定元件(手機底部分頁列)
// 預留的空間,所以照著扣就會停在正確的位置。
//
// 舊版是 window.innerHeight 減一個寫死的常數(桌機 padding 的總和):桌機剛好
// 對,手機少扣了 96px 的分頁列,清單最後一列會被蓋住而且不會有人發現。
// 這裡不留任何魔術數字。
const MIN_HEIGHT = 240;

function availableBottom(el: HTMLElement): number {
  let limit = window.innerHeight;
  let node: HTMLElement | null = el.parentElement;

  while (node && node !== document.body) {
    const style = getComputedStyle(node);
    // display:contents 的元素沒有自己的框(BossShell 桌機版的 lg:contents
    // 包裝層就是),量它會拿到 0,直接跳過
    if (style.display !== 'contents') {
      const rect = node.getBoundingClientRect();
      if (rect.height > 0) {
        const padBottom = parseFloat(style.paddingBottom) || 0;
        limit = Math.min(limit, Math.min(rect.bottom, window.innerHeight) - padBottom);
      }
    }
    node = node.parentElement;
  }

  return limit;
}

export default function ViewportLock({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    function measure() {
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      setHeight(Math.max(MIN_HEIGHT, Math.floor(availableBottom(el) - top)));
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
