'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isTabActive, type PageTab } from '@/lib/nav';

// 把「同一個系統的數個頁面」在視覺上併成一頁的分頁列。
// 分頁背後仍是各自獨立的路由——上一頁可用、深層連結可分享、各頁只載自己
// 需要的資料與程式碼(陣列設計器的畫布不會被 SPL 計算器一起拖進來)。
//
// hideOn:某些子頁不該出現分頁列(例如報價單的列印版,分頁列會被印出來)。
export default function PageTabs({
  tabs,
  hideOn = [],
}: {
  tabs: PageTab[];
  hideOn?: string[];
}) {
  const pathname = usePathname() ?? '';
  if (hideOn.some((frag) => pathname.includes(frag))) return null;

  return (
    <nav
      className="mb-5 flex items-center gap-1 overflow-x-auto rounded-2xl nm-inset p-1 text-[13px]"
      aria-label="分頁"
    >
      {tabs.map((tab) => {
        const active = isTabActive(pathname, tab);
        return (
          <span key={tab.href} className="flex items-center gap-1">
            {tab.dividerBefore && (
              <span
                className="mx-1 h-4 w-px shrink-0"
                style={{ background: 'var(--nm-border-hair)' }}
                aria-hidden
              />
            )}
            <Link
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={`${active ? 'nm-btn-solid' : 'nm-btn'} whitespace-nowrap`}
              style={{ padding: '6px 14px', minHeight: 'auto' }}
            >
              {tab.label}
            </Link>
          </span>
        );
      })}
    </nav>
  );
}
