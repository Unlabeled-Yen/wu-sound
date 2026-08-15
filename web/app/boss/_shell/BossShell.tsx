'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ToastProvider } from './Toast';
import { BrandLockup, BrandMark } from '@/app/_shared/BrandLogo';
import {
  NAV_SECTIONS,
  SETTINGS_SECTION,
  findActiveItemLabel,
  findActiveMobileTab,
  findActiveSection,
  findMobileTitle,
  visibleItems,
  type NavSection,
} from '@/lib/nav';

// Hot routes prefetched on mount so first-click nav is instant
// 陣列設計器頁面較重(畫布互動),不預抓,避免拖慢一般導覽
const PREFETCH_ROUTES = ['/boss', '/boss/expenses', '/boss/ledger', '/boss/quotes', '/tools/spl-calculator'];

function useBossShellData() {
  const router = useRouter();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    // Prefetch hot routes so nav feels instant
    for (const href of PREFETCH_ROUTES) router.prefetch(href);
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    // Fetch pending badge count client-side so layout doesn't block every nav
    fetch('/api/boss/pending-count', { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : { count: 0 })
      .then((j) => { if (!cancelled) setPendingCount(j.count ?? 0); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return pendingCount;
}

// 導覽結構在 lib/nav.ts(側欄、標題列、手機分頁共用同一份,並有單元測試釘住)。
// 這裡只補「圖示」——圖示是視覺,不放進純邏輯模組。
const SECTION_ICONS: Record<string, React.ReactNode> = {
  overview: <HomeIcon />,
  finance: <WalletIcon />,
  acoustic: <WaveIcon />,
  quotes: <DocIcon />,
  equipment: <BoxIcon />,
  sites: <PinIcon />,
  ops: <UsersIcon />,
  tenders: <DocIcon />,
  settings: <GearIcon />,
};

// Mobile bottom-nav tabs (5 slots)
type MobileTab = { key: string; href: string; label: string; icon: (active: boolean) => React.ReactNode };
const MOBILE_TABS: MobileTab[] = [
  { key: 'overview', href: '/boss', label: '總覽', icon: MobileHomeIcon },
  { key: 'review', href: '/boss/expenses', label: '審核', icon: MobileCheckIcon },
  { key: 'quotes', href: '/boss/quotes', label: '報價', icon: MobileDocIcon },
  { key: 'ops', href: '/boss/worklogs', label: '現場', icon: MobileUsersIcon },
  { key: 'more', href: '/boss/more', label: '更多', icon: MobileMoreIcon },
];

function currentMonthLabel(): string {
  const d = new Date();
  return `本月 ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function BossShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/boss';
  const active = useMemo(() => findActiveSection(pathname), [pathname]);
  const activeTab = useMemo(() => findActiveMobileTab(pathname), [pathname]);
  const mobileTitle = useMemo(() => findMobileTitle(pathname), [pathname]);
  const monthLabel = useMemo(() => currentMonthLabel(), []);
  const pendingCount = useBossShellData();

  const desktopActiveLabel = useMemo(() => findActiveItemLabel(pathname), [pathname]);
  // 區塊名和頁面名相同時(例如報價系統首頁)不重複顯示,不然標題列會變成
  // 「報價系統 › 報價系統」
  const showEyebrow = active.label !== desktopActiveLabel;

  return (
    <ToastProvider>
      <div
        className="relative z-[1] min-h-screen lg:h-screen lg:overflow-hidden w-full flex flex-col lg:flex-row lg:p-3.5 lg:gap-3.5"
        style={{ color: 'var(--nm-text-body)' }}
      >
        {/* ===== Desktop sidebar (≥lg only) ===== */}
        <aside className="hidden lg:flex shrink-0 w-[232px] rounded-[20px] nm-raised-lg flex-col overflow-hidden">
          <div className="px-4 pt-[22px] pb-4" style={{ borderBottom: '1px solid var(--nm-border-hair)' }}>
            <Link href="/boss" className="flex justify-center nm-focus rounded-lg" aria-label="聲生 SSA 工作系統">
              <BrandLockup width={140} />
            </Link>
          </div>

          <nav className="flex-1 px-3 py-3.5 overflow-y-auto flex flex-col gap-[22px]">
            {NAV_SECTIONS.map((section) => (
              <SectionGroup
                key={section.key}
                section={section}
                pathname={pathname}
              />
            ))}
          </nav>

          <div className="p-3 space-y-0.5" style={{ borderTop: '1px solid var(--nm-border-hair)' }}>
            <SectionGroup
              section={SETTINGS_SECTION}
              pathname={pathname}
            />
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="w-full flex items-center gap-2.5 rounded-[11px] px-2.5 py-2 text-[13px] nm-focus nm-lift"
                style={{ color: 'var(--nm-text-muted)' }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <path d="M16 17l5-5-5-5" />
                  <path d="M21 12H9" />
                </svg>
                <span>登出</span>
              </button>
            </form>
          </div>
        </aside>

        {/* ===== Mobile top header (＜lg only) ===== */}
        <header
          className="lg:hidden sticky top-0 z-30 px-[22px] pt-1.5 pb-4"
          style={{
            background: 'rgba(20,20,23,0.34)',
            WebkitBackdropFilter: 'blur(14px) saturate(1.15)',
            backdropFilter: 'blur(14px) saturate(1.15)',
            borderBottom: '1px solid rgba(255,255,255,0.10)',
          }}
        >
          <div className="flex items-center justify-between text-[13px] mb-[14px]" style={{ color: 'var(--nm-text-secondary)' }}>
            {/* 不顯示姓名/角色:登入後權限已定,使用者不需要辨識自己是誰 */}
            <BrandMark size={17} className="opacity-85" />
            <span className="text-[12px]">{monthLabel}</span>
          </div>
          <div
            className="text-[25px] font-semibold tracking-[-0.01em]"
            style={{ color: 'var(--nm-text-primary)', textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}
          >
            {mobileTitle.title}
          </div>
          {mobileTitle.subtitle ? (
            <div className="text-[13px] mt-[3px]" style={{ color: 'var(--nm-text-secondary)' }}>
              {mobileTitle.subtitle}
            </div>
          ) : null}
        </header>

        {/* ===== Main content — shared by desktop & mobile ===== */}
        <main
          className="flex-1 min-w-0 flex flex-col lg:rounded-[20px] lg:nm-raised-lg lg:overflow-hidden"
        >
          {/* Desktop-only title bar */}
          <div
            className="hidden lg:flex px-8 py-5 items-end justify-between"
            style={{ borderBottom: '1px solid var(--nm-border-hair)' }}
          >
            <div>
              {showEyebrow && (
                <div
                  className="text-[11px] uppercase tracking-[0.16em] mb-1.5"
                  style={{ color: 'var(--nm-text-muted)' }}
                >
                  {active.label}
                </div>
              )}
              <div
                className="text-[22px] font-semibold tracking-[-0.01em]"
                style={{ color: 'var(--nm-text-primary)' }}
              >
                {desktopActiveLabel}
              </div>
            </div>
          </div>
          <div
            className="flex-1 lg:overflow-auto px-[22px] pt-[18px] lg:px-8 lg:pt-6 lg:pb-8"
            style={{
              color: 'var(--nm-text-body)',
              paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 96px)',
            }}
          >
            <div className="lg:contents">{children}</div>
          </div>
        </main>

        {/* ===== Mobile bottom tab bar (＜lg only) ===== */}
        <nav
          className="lg:hidden fixed bottom-0 inset-x-0 z-40 px-3 pt-2 grid grid-cols-5"
          style={{
            background: 'rgba(16,16,20,0.5)',
            WebkitBackdropFilter: 'blur(22px) saturate(1.2)',
            backdropFilter: 'blur(22px) saturate(1.2)',
            borderTop: '1px solid rgba(255,255,255,0.12)',
            paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)',
          }}
        >
          <MobileTabBar activeTab={activeTab} pendingCount={pendingCount} />
        </nav>
      </div>
    </ToastProvider>
  );
}

function MobileTabBar({ activeTab, pendingCount }: { activeTab: string; pendingCount: number }) {
  return (
    <>
      {MOBILE_TABS.map((t) => {
        const active = t.key === activeTab;
        const badge = t.key === 'review' ? pendingCount : 0;
        return (
          <Link
            key={t.href}
            href={t.href}
            className="relative flex flex-col items-center justify-center gap-1 py-1.5 rounded-2xl text-[10.5px] tracking-wide nm-focus"
            style={{ color: active ? '#f0f0f2' : '#7d7e83' }}
            data-tab={t.key}
            aria-current={active ? 'page' : undefined}
          >
            <span className="relative">
              {t.icon(active)}
              {badge > 0 ? (
                <span
                  className="absolute -top-1.5 -right-3 min-w-[17px] h-[17px] px-1 rounded-full text-[10px] font-bold leading-[17px] text-center"
                  style={{ background: 'var(--nm-warning)', color: '#17171a' }}
                >
                  {badge}
                </span>
              ) : null}
            </span>
            <span>{t.label}</span>
          </Link>
        );
      })}
    </>
  );
}

function SectionGroup({
  section,
  pathname,
}: {
  section: NavSection;
  pathname: string;
}) {
  // hidden 的項目(靠頁內分頁進入的子頁)不畫在側欄,但仍讓整個區塊高亮——
  // 人在價目表時,側欄該亮的是「報價系統」那一列。
  const items = visibleItems(section);
  const multi = items.length > 1;
  const sectionActive = section.items.some(
    (i) => pathname === i.href || pathname.startsWith(i.href + '/'),
  );

  return (
    <div className="flex flex-col gap-[3px]">
      {multi && (
        <div
          className="px-[11px] pt-1.5 pb-1.5 text-[10.5px] uppercase tracking-[0.18em]"
          style={{ color: 'var(--nm-text-faint)' }}
        >
          {section.label}
        </div>
      )}
      <ul className="flex flex-col gap-[3px]">
        {items.map((item, idx) => {
          const isActive = multi
            ? pathname === item.href || pathname.startsWith(item.href + '/')
            : sectionActive;
          const isGroupLead = multi && idx === 0;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={`flex items-center gap-2.5 rounded-[11px] text-[13.5px] nm-focus ${
                  isGroupLead ? 'px-[11px] py-2.5' : multi ? 'py-2 pl-10 pr-[11px] text-[13px]' : 'px-[11px] py-2.5'
                } ${isActive ? 'nm-inset-sm' : 'nm-lift'}`}
                style={{
                  color: isActive ? 'var(--nm-text-primary)' : '#8a8b90',
                }}
              >
                {(isGroupLead || !multi) && (
                  <span className="shrink-0 opacity-85">{SECTION_ICONS[section.key]}</span>
                )}
                <span className="truncate">{multi ? item.label : section.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* --- icons (inline SVG, no deps) --- */

function HomeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M10 21v-6h4v6" />
    </svg>
  );
}
function WalletIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6" width="18" height="14" rx="2" />
      <path d="M16 13h3" />
      <path d="M3 10h18" />
    </svg>
  );
}
function WaveIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15V9" />
      <path d="M8 18V6" />
      <path d="M12 20.5v-17" />
      <path d="M16 18V6" />
      <path d="M20 15V9" />
    </svg>
  );
}
function DocIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h4" />
    </svg>
  );
}
function BoxIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 8 12 3 3 8v8l9 5 9-5V8z" />
      <path d="M3 8l9 5 9-5" />
      <path d="M12 13v8" />
    </svg>
  );
}
function PinIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}
function UsersIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.5-3.5 3.5-5.5 6.5-5.5s6 2 6.5 5.5" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M15 15c2.5 0 5 1.5 5.5 4" />
    </svg>
  );
}
function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}

/* --- Mobile bottom-nav icons (stroke 1.7, 23px, from mockup) --- */
function MobileHomeIcon(active: boolean) {
  const c = active ? '#f0f0f2' : '#7d7e83';
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M10 21v-6h4v6" />
    </svg>
  );
}
function MobileCheckIcon(active: boolean) {
  const c = active ? '#f0f0f2' : '#7d7e83';
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}
function MobileDocIcon(active: boolean) {
  const c = active ? '#f0f0f2' : '#7d7e83';
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h4" />
    </svg>
  );
}
function MobileUsersIcon(active: boolean) {
  const c = active ? '#f0f0f2' : '#7d7e83';
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.5-3.5 3.5-5.5 6.5-5.5s6 2 6.5 5.5" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M15 15c2.5 0 5 1.5 5.5 4" />
    </svg>
  );
}
function MobileMoreIcon(active: boolean) {
  const c = active ? '#f0f0f2' : '#7d7e83';
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  );
}
