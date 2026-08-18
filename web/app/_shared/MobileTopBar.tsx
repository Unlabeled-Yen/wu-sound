'use client';

import Link from 'next/link';
import { useState } from 'react';
import { BrandLockup } from './BrandLogo';
import type { UserRole } from '@/lib/types';

// 手機版共用頂列(2026-08-18 Yen 定案,取代原本的底部分頁列):AI 助理聊天頁
// 是首頁,其餘功能收進左上角抽屜——仿 Claude 手機版排版(漢堡選單開抽屜,
// 不是常駐分頁列)。員工跟老闆共用這支元件的排版與手勢邏輯,只有抽屜項目
// 依角色不同(見 DRAWER_ITEMS_BY_ROLE)——「同一個 AI,入口不同而已」,
// 殼層當然也是同一份,不要各自長一套導覽邏輯。
type DrawerItem = { href: string; label: string; icon: React.ReactNode; badgeKey?: 'capture' };

const STAFF_DRAWER_ITEMS: DrawerItem[] = [
  { href: '/voice-lab-chat?voice=1', label: 'AI 助理', icon: <ChatIcon /> },
  { href: '/staff/capture', label: '零用金', icon: <CameraIcon />, badgeKey: 'capture' },
  { href: '/staff/memo', label: '專案備忘', icon: <LogIcon /> },
  { href: '/staff/clockin', label: '打卡', icon: <ClockIcon /> },
];

// 老闆的聊天首頁本身就是 /boss,抽屜不需要再放一個回自己的「AI 助理」項目
// (跟員工不同——員工的抽屜會在聊天頁以外的子頁也出現,需要有路回去)。
// 「總覽」金流摘要放最後一項(2026-08-18 Yen 定案),前面是老闆平常最常用的
// 三塊:零用金審核／專案／財務,其餘(報價、現場、標案、設備、聲學計算、
// 使用者管理)一律收進「更多」,不逐項砍功能。
const BOSS_DRAWER_ITEMS: DrawerItem[] = [
  { href: '/boss/expenses', label: '零用金審核', icon: <CheckIcon /> },
  { href: '/boss/sites', label: '專案', icon: <PinIcon /> },
  { href: '/boss/ledger', label: '財務', icon: <WalletIcon /> },
  { href: '/boss/more', label: '更多', icon: <MoreIcon /> },
  { href: '/boss/overview', label: '總覽（金流摘要）', icon: <ChartIcon /> },
];

export function MobileTopBar({
  role = 'staff',
  draftCount = 0,
  right,
}: {
  role?: UserRole;
  draftCount?: number;
  right?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const items = role === 'boss' ? BOSS_DRAWER_ITEMS : STAFF_DRAWER_ITEMS;

  return (
    <>
      <header
        className="sticky top-0 z-30 px-[18px] pt-1.5 pb-3 flex items-center justify-between"
        style={{
          background: 'rgba(20,20,23,0.34)',
          WebkitBackdropFilter: 'blur(14px) saturate(1.15)',
          backdropFilter: 'blur(14px) saturate(1.15)',
          borderBottom: '1px solid rgba(255,255,255,0.10)',
        }}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="開啟功能選單"
          className="p-1.5 -ml-1.5 nm-focus rounded-lg"
          style={{ color: 'var(--nm-text-secondary)' }}
        >
          <MenuIcon />
        </button>
        <BrandLockup width={78} className="opacity-85" />
        <div className="w-7 flex justify-end">{right}</div>
      </header>

      {open && (
        <div
          className="fixed inset-0 z-50 flex"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            className="h-full flex flex-col gap-1 p-4 pt-6"
            style={{ width: '78%', maxWidth: 300, background: '#151517', borderRight: '1px solid rgba(255,255,255,0.08)' }}
          >
            <div
              className="text-[10.5px] uppercase tracking-[0.18em] px-2 mb-1"
              style={{ color: 'var(--nm-text-faint)' }}
            >
              功能
            </div>
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="relative flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-[14px] nm-focus"
                style={{ color: 'var(--nm-text-body)' }}
              >
                <span className="opacity-85">{item.icon}</span>
                {item.label}
                {item.badgeKey === 'capture' && draftCount > 0 && (
                  <span
                    className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full text-[10.5px] font-bold leading-[18px] text-center"
                    style={{ background: 'var(--nm-warning)', color: '#17171a' }}
                  >
                    {draftCount}
                  </span>
                )}
              </Link>
            ))}

            <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '10px 4px' }} />

            <Link
              href={role === 'boss' ? '/boss/users' : '/staff/settings'}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-[14px] nm-focus"
              style={{ color: 'var(--nm-text-body)' }}
            >
              <span className="opacity-85">
                <GearIcon />
              </span>
              設定
            </Link>
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="w-full flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-[14px] nm-focus"
                style={{ color: 'var(--nm-danger-glass-text)' }}
              >
                <span className="opacity-85">
                  <LogoutIcon />
                </span>
                登出
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function MenuIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}
function CameraIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 4h-5L8 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-4z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}
function LogIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h4" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}
function PinIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}
function WalletIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2" />
      <path d="M3 7v11a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-6a1 1 0 0 0-1-1h-4a2 2 0 1 0 0 4" />
    </svg>
  );
}
function MoreIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  );
}
function ChartIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19h16" />
      <path d="M7 19v-5M12 19V8M17 19v-9" />
    </svg>
  );
}
function GearIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}
function LogoutIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}
