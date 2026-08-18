'use client';

import Link from 'next/link';
import { useState } from 'react';
import { BrandLockup } from './BrandLogo';

// 員工手機版導覽(2026-08-18 Yen 定案,取代原本的底部三分頁):AI 助理聊天頁
// 是首頁,零用金/專案備忘/打卡收進左上角抽屜——仿 Claude 手機版排版
// (漢堡選單開抽屜,不是常駐分頁列)。這支元件是共用的頂列,
// /staff/* 子頁(StaffMobileShell)跟 /voice-lab-chat 首頁都用它,
// 不要各自長一份導覽邏輯出來。
const DRAWER_ITEMS: { href: string; label: string; icon: React.ReactNode; badgeKey?: 'capture' }[] = [
  { href: '/voice-lab-chat?voice=1', label: 'AI 助理', icon: <ChatIcon /> },
  { href: '/staff/capture', label: '零用金', icon: <CameraIcon />, badgeKey: 'capture' },
  { href: '/staff/memo', label: '專案備忘', icon: <LogIcon /> },
  { href: '/staff/clockin', label: '打卡', icon: <ClockIcon /> },
];

export function StaffMobileTopBar({ draftCount = 0, right }: { draftCount?: number; right?: React.ReactNode }) {
  const [open, setOpen] = useState(false);

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
            {DRAWER_ITEMS.map((item) => (
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
              href="/staff/settings"
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
