'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { ToastProvider } from './Toast';

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

export function BossShell({ userName, children }: { userName: string; children: React.ReactNode }) {
  const pathname = usePathname() ?? '/boss';
  const active = useMemo(() => findActiveSection(pathname), [pathname]);

  return (
    <ToastProvider>
      <div
        className="relative z-[1] min-h-screen w-full p-3.5 lg:p-3.5 flex gap-3.5"
        style={{ color: 'var(--nm-text-body)' }}
      >
        {/* Single side panel — icon + label, grouped by section */}
        <aside className="shrink-0 w-[232px] rounded-[20px] nm-raised-lg flex flex-col overflow-hidden">
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

        {/* Main content panel — glass surface */}
        <main className="flex-1 min-w-0 rounded-[20px] nm-raised-lg overflow-hidden flex flex-col">
          <div
            className="px-8 py-5 flex items-end justify-between"
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
                {active.items.find(
                  (i) => pathname === i.href || pathname.startsWith(i.href + '/')
                )?.label ?? active.items[0].label}
              </div>
            </div>
          </div>
          <div
            className="flex-1 overflow-auto px-6 pb-8 pt-6 lg:px-8"
            style={{ color: 'var(--nm-text-body)' }}
          >
            {children}
          </div>
        </main>
      </div>
    </ToastProvider>
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
