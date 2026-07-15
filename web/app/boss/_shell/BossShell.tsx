'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ToastProvider } from './Toast';

// Hot routes prefetched on mount so first-click nav is instant
const PREFETCH_ROUTES = ['/boss', '/boss/expenses', '/boss/close', '/boss/ledger', '/boss/quotes'];

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

type NavItem = { href: string; label: string };
type NavSection = { key: string; label: string; icon: React.ReactNode; items: NavItem[] };

const SECTIONS: NavSection[] = [
  {
    key: 'overview',
    label: '總覽',
    icon: <HomeIcon />,
    items: [{ href: '/boss', label: 'Dashboard' }],
  },
  {
    key: 'finance',
    label: '財務',
    icon: <WalletIcon />,
    items: [
      { href: '/boss/expenses', label: '零用金管理' },
      { href: '/boss/close', label: '薪資結算' },
      { href: '/boss/ledger', label: '帳務管理' },
    ],
  },
  {
    key: 'quotes',
    label: '報價系統',
    icon: <DocIcon />,
    items: [
      { href: '/boss/quotes', label: '報價單' },
      { href: '/boss/bundles', label: '標配套組' },
      { href: '/boss/catalog', label: '價目表' },
    ],
  },
  {
    key: 'catalog',
    label: '案件管理',
    icon: <BoxIcon />,
    items: [
      { href: '/boss/equipment', label: '設備庫存' },
      { href: '/boss/sites', label: '專案' },
    ],
  },
  {
    key: 'ops',
    label: '現場',
    icon: <UsersIcon />,
    items: [
      { href: '/boss/worklogs', label: '工作記錄' },
      { href: '/boss/clockins', label: '打卡' },
    ],
  },
];

const SETTINGS_SECTION: NavSection = {
  key: 'settings',
  label: '設定',
  icon: <GearIcon />,
  items: [{ href: '/boss/users', label: '使用者管理' }],
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

function findActiveSection(pathname: string): NavSection {
  const all = [...SECTIONS, SETTINGS_SECTION];
  const matches = all
    .map((s) => ({
      section: s,
      score: Math.max(
        ...s.items.map((i) => (pathname === i.href ? 1000 : pathname.startsWith(i.href + '/') ? i.href.length : 0)),
        pathname === '/boss' && s.key === 'overview' ? 1000 : 0
      ),
    }))
    .sort((a, b) => b.score - a.score);
  return matches[0].score > 0 ? matches[0].section : SECTIONS[0];
}

function findActiveMobileTab(pathname: string): string {
  // /boss/more takes precedence
  if (pathname === '/boss/more' || pathname.startsWith('/boss/more/')) return 'more';
  if (pathname === '/boss') return 'overview';
  // pages tied to a specific tab
  if (pathname.startsWith('/boss/expenses')) return 'review';
  if (pathname.startsWith('/boss/quotes')) return 'quotes';
  if (pathname.startsWith('/boss/worklogs') || pathname.startsWith('/boss/clockins')) return 'ops';
  // everything else lives under 更多
  return 'more';
}

function currentMonthLabel(): string {
  const d = new Date();
  return `本月 ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const MOBILE_TITLES: Record<string, { title: string; subtitle?: string }> = {
  '/boss': { title: '總覽', subtitle: '今天需要你處理的事' },
  '/boss/expenses': { title: '零用金審核', subtitle: '每筆須人工確認才生效' },
  '/boss/quotes': { title: '報價', subtitle: '進行中的報價單' },
  '/boss/worklogs': { title: '現場', subtitle: '工作記錄' },
  '/boss/clockins': { title: '打卡', subtitle: '出勤記錄' },
  '/boss/more': { title: '更多', subtitle: '其他管理與設定' },
  '/boss/ledger': { title: '帳務管理' },
  '/boss/close': { title: '薪資結算' },
  '/boss/bundles': { title: '標配套組' },
  '/boss/catalog': { title: '價目表' },
  '/boss/equipment': { title: '設備庫存' },
  '/boss/sites': { title: '專案' },
  '/boss/users': { title: '使用者管理' },
};

function findMobileTitle(pathname: string): { title: string; subtitle?: string } {
  // exact match
  if (MOBILE_TITLES[pathname]) return MOBILE_TITLES[pathname];
  // longest prefix match
  const candidates = Object.keys(MOBILE_TITLES)
    .filter((p) => pathname === p || pathname.startsWith(p + '/'))
    .sort((a, b) => b.length - a.length);
  return candidates[0] ? MOBILE_TITLES[candidates[0]] : { title: '' };
}

export function BossShell({
  userName,
  children,
}: {
  userName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? '/boss';
  const active = useMemo(() => findActiveSection(pathname), [pathname]);
  const activeTab = useMemo(() => findActiveMobileTab(pathname), [pathname]);
  const mobileTitle = useMemo(() => findMobileTitle(pathname), [pathname]);
  const monthLabel = useMemo(() => currentMonthLabel(), []);
  const pendingCount = useBossShellData();

  const desktopActiveLabel =
    active.items.find(
      (i) => pathname === i.href || pathname.startsWith(i.href + '/')
    )?.label ?? active.items[0].label;

  return (
    <ToastProvider>
      <div
        className="relative z-[1] min-h-screen w-full flex flex-col lg:flex-row lg:p-3.5 lg:gap-3.5"
        style={{ color: 'var(--nm-text-body)' }}
      >
        {/* ===== Desktop sidebar (≥lg only) ===== */}
        <aside className="hidden lg:flex shrink-0 w-[232px] rounded-[20px] nm-raised-lg flex-col overflow-hidden">
          <div className="px-4 pt-[18px] pb-3.5" style={{ borderBottom: '1px solid var(--nm-border-hair)' }}>
            <div className="flex items-center gap-2.5">
              <div
                className="w-[38px] h-[38px] rounded-xl flex items-center justify-center text-[15px] font-medium shrink-0"
                style={{ background: '#242429', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)', color: 'var(--nm-text-body)' }}
                aria-hidden
              >
                {userName.slice(0, 1)}
              </div>
              <div className="min-w-0">
                <div
                  className="text-sm font-medium truncate leading-tight"
                  style={{ color: 'var(--nm-text-body)' }}
                >
                  {userName}
                </div>
                <div
                  className="text-[11.5px] truncate tracking-wide"
                  style={{ color: 'var(--nm-text-muted)' }}
                >
                  聲生 SSA · 老闆
                </div>
              </div>
            </div>
          </div>

          <nav className="flex-1 px-3 py-3.5 overflow-y-auto flex flex-col gap-[22px]">
            {SECTIONS.map((section) => (
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
            <span>{userName} · 老闆</span>
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
              <div
                className="text-[11px] uppercase tracking-[0.16em] mb-1.5"
                style={{ color: 'var(--nm-text-muted)' }}
              >
                {active.label}
              </div>
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
  return (
    <div className="flex flex-col gap-[3px]">
      {section.items.length > 1 && (
        <div
          className="px-[11px] pt-1.5 pb-1.5 text-[10.5px] uppercase tracking-[0.18em]"
          style={{ color: 'var(--nm-text-faint)' }}
        >
          {section.label}
        </div>
      )}
      <ul className="flex flex-col gap-[3px]">
        {section.items.map((item, idx) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + '/');
          const isGroupLead = section.items.length > 1 && idx === 0;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={`flex items-center gap-2.5 rounded-[11px] text-[13.5px] nm-focus ${
                  isGroupLead ? 'px-[11px] py-2.5' : section.items.length > 1 ? 'py-2 pl-10 pr-[11px] text-[13px]' : 'px-[11px] py-2.5'
                } ${isActive ? 'nm-inset-sm' : 'nm-lift'}`}
                style={{
                  color: isActive ? 'var(--nm-text-primary)' : '#8a8b90',
                }}
              >
                {isGroupLead && <span className="shrink-0 opacity-85">{section.icon}</span>}
                <span className="truncate">
                  {section.items.length === 1 ? section.label : item.label}
                </span>
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
