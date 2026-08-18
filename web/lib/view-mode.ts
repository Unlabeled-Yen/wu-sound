import type { Viewport } from 'next';
import type { UserRole } from './types';

/**
 * 員工手機版暫緩開發中(見 docs/desktop-lock-and-staff-access-spec-v1.md)。
 * 做完後改成 true,員工即回到跟隨裝置的版面判斷,行為與老闆端相同。
 */
export const STAFF_MOBILE_ENABLED = false;

// 跟 app/layout.tsx 的 root viewport 一致——老闆維持這份,版面照裝置走。
const NORMAL_VIEWPORT: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0A0A0A',
};

// 員工桌面版鎖定的核心機制:把 layout viewport 硬性設成 1280,不設
// initialScale——瀏覽器會自動算出縮放比例讓整頁塞進螢幕(跟早期非響應式
// 網站在手機上「顯示桌面版」的行為一樣),一個設定翻動全部 Tailwind 的
// lg: 斷點,不必逐一改樣式。userScalable 保持開啟、maximumScale 給夠大,
// 手機上鎖桌面後字會變小,使用者必須能雙指放大——不能沿用 root layout 的
// maximumScale:1。
const STAFF_LOCKED_VIEWPORT: Viewport = {
  width: 1280,
  minimumScale: 0.25,
  maximumScale: 5,
  userScalable: true,
  themeColor: '#0A0A0A',
};

/**
 * 依角色決定這個 request 該用哪份 viewport。老闆一律跟裝置走;
 * 員工在 STAFF_MOBILE_ENABLED=false 期間一律鎖桌面寬度,不分登入裝置。
 */
export function viewportForRole(role: UserRole | null): Viewport {
  if (role === 'staff' && !STAFF_MOBILE_ENABLED) return STAFF_LOCKED_VIEWPORT;
  return NORMAL_VIEWPORT;
}
