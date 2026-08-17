'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface LedgerTab {
  key: string;
  label: string;
  href: string;
  node: ReactNode;
}

// 五個分頁的殼層。所有分頁的內容在伺服器端一次算好、一次送到瀏覽器
// (見 page.tsx),這裡只負責「哪一頁現在看得到」——切換不重新請求、不等待。
// 桌機用滑鼠/觸控板橫向滑動(wheel deltaX)切換,任何裝置點分頁名稱也能切換。
// 網址的 ?mode= 用 history.pushState 同步(重新整理/分享連結還在對的分頁),
// 但故意不走 Next router,避免每次切分頁都觸發一次伺服器往返。
export function LedgerTabSwiper({ tabs, activeKey, trailing }: {
  tabs: LedgerTab[];
  activeKey: string;
  trailing?: ReactNode;
}) {
  const [index, setIndex] = useState(() => Math.max(0, tabs.findIndex((t) => t.key === activeKey)));
  // 橫向軌道的寬度/位移用 inline style 算(桌機專屬),靠這個 flag 開關——
  // 不要在 class 裡塞斷點專屬的動態 transform 寫法,量出來這個專案的
  // Tailwind v4 設定不吃(套用了也不生效),索性直接用 matchMedia 判斷,
  // 穩定可靠。初始值跟 SSR 一致(false),掛載後用 useEffect 校正,避免
  // hydration mismatch。
  const [isDesktop, setIsDesktop] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const wheelState = useRef<{ accum: number; locked: boolean; silenceTimer: ReturnType<typeof setTimeout> | null }>({ accum: 0, locked: false, silenceTimer: null });
  // wheel 事件監聽器只掛一次(見下面那個 effect 的說明),靠這兩個 ref 讀最新的
  // index/tabs,不用每次 index 變動就整個拆掉重掛。
  const indexRef = useRef(index);
  const tabsRef = useRef(tabs);
  useEffect(() => { indexRef.current = index; }, [index]);
  useEffect(() => { tabsRef.current = tabs; }, [tabs]);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    setIsDesktop(mq.matches);
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // 月份/篩選這類「真的要換資料」的操作走真實導頁,伺服器重新算完那一頁的
  // mode 會變——同步回來,不然滑到別分頁後按上月/下月,分頁會跳掉。
  useEffect(() => {
    const i = tabs.findIndex((t) => t.key === activeKey);
    if (i >= 0) setIndex(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  function goTo(i: number) {
    const list = tabsRef.current;
    const clamped = Math.max(0, Math.min(list.length - 1, i));
    if (clamped === indexRef.current) return;
    indexRef.current = clamped; // 立刻更新,同一個手勢裡連續呼叫也讀得到最新值,不用等 React 重繪
    setIndex(clamped);
    window.history.pushState(null, '', list[clamped].href);
  }

  // wheel 監聽器只在掛載時裝一次(deps 是空陣列)——不要跟著 index 變動重新
  // 掛載。之前跟著 index 重掛時,「安靜計時器」的 cleanup 會把自己剛排好的
  // 解鎖計時器一起砍掉,觸發一次切換後就永久鎖死,滑不動第二次;現在改成
  // 全部讀 ref(indexRef/tabsRef 永遠是最新值),不需要重新掛載就能拿到最新狀態。
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const mq = window.matchMedia('(min-width: 1024px)');

    function onWheel(e: WheelEvent) {
      if (!mq.matches) return; // 滑動切換是桌機(滑鼠/觸控板)手勢,手機維持點擊切換
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // 直向捲動,不要攔
      e.preventDefault();

      // 觸控板一次「滑一頁」的手勢,慣性尾巴常常拖超過半秒還在送 wheel 事件——
      // 用固定時間解鎖(例如 380ms 後解鎖)的話,長一點的慣性尾巴會被誤判成
      // 「使用者又滑了第二次」,一次滑動變成跳兩頁。改成「安靜計時器」:每收到
      // 一個事件就重新起算,只有真的停下來(一段時間沒有任何 wheel 事件)才解鎖,
      // 這樣不管慣性拖多久,同一個手勢從頭到尾只會觸發一次切換。
      if (wheelState.current.silenceTimer) clearTimeout(wheelState.current.silenceTimer);
      wheelState.current.silenceTimer = setTimeout(() => {
        wheelState.current.locked = false;
        wheelState.current.accum = 0;
      }, 150);

      if (wheelState.current.locked) return;

      wheelState.current.accum += e.deltaX;
      const THRESHOLD = 60;
      if (wheelState.current.accum > THRESHOLD) {
        goTo(indexRef.current + 1);
        wheelState.current.locked = true;
      } else if (wheelState.current.accum < -THRESHOLD) {
        goTo(indexRef.current - 1);
        wheelState.current.locked = true;
      }
    }

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      if (wheelState.current.silenceTimer) clearTimeout(wheelState.current.silenceTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onTabClick(e: React.MouseEvent, i: number) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // 讓「開新分頁」等瀏覽器內建行為照常運作
    e.preventDefault();
    goTo(i);
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 shrink-0">
        <div className="nm-inset flex gap-1.5 text-[13px] flex-nowrap overflow-x-auto" style={{ borderRadius: 999, padding: 4, color: 'var(--nm-text-secondary)' }}>
          {tabs.map((t, i) => (
            <a
              key={t.key}
              href={t.href}
              onClick={(e) => onTabClick(e, i)}
              className="shrink-0"
              style={
                i === index
                  ? { borderRadius: 999, padding: '6px 14px', background: '#f0f0f2', color: '#17171a', fontWeight: 500 }
                  : { borderRadius: 999, padding: '6px 14px' }
              }
            >{t.label}</a>
          ))}
        </div>
        {trailing}
      </div>

      {/* 每個分頁的內容只掛載一份——手機只顯示目前分頁(一般區塊排版,不鎖高度);
          桌機五個分頁都在同一條橫向軌道上(位移切換,不重新請求)。用同一組 DOM
          節點靠斷點切換 class,不是「手機一份、桌機再掛一份」,不然使用中的分頁
          會同時有兩份互相獨立的互動狀態(輸入框、下拉選單各自為政)。
          trackRef 只負責裁切視窗(桌機 overflow-hidden)+ 接收滑動手勢的 wheel
          事件;真正橫向位移的軌道是裡面這條 rail,寬度/位移只在桌機生效
          (lg: 前綴),手機這條 rail 退回一般 block,由每個分頁自己的 hidden
          決定顯示哪一個。 */}
      <div ref={trackRef} className="flex-1 min-h-0 lg:overflow-hidden">
        <div
          className="h-full lg:flex lg:transition-transform lg:duration-300 lg:ease-out"
          style={isDesktop ? { width: `${tabs.length * 100}%`, transform: `translateX(-${index * (100 / tabs.length)}%)` } : undefined}
        >
          {tabs.map((t, i) => (
            <div
              key={t.key}
              className={i === index ? 'h-full lg:shrink-0' : 'hidden lg:block lg:h-full lg:shrink-0'}
              style={isDesktop ? { width: `${100 / tabs.length}%` } : undefined}
            >
              {t.node}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
