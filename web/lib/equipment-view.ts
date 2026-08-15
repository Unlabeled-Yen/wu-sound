// 設備庫存（跳線盤）共用的純函式：天數計算、停滯門檻、顏色語意。
// 不含 JSX——list/detail/mobile 頁與 client 元件都能直接 import。
import type { EquipmentStatus } from './types';

/** 送修超過這麼多天視為「沒下文」。 */
export const REPAIR_STUCK_DAYS = 14;
/** 在同一案場超過這麼多天視為「該確認」。 */
export const SITE_STUCK_DAYS = 30;

export function daysSince(dateStr: string | null | undefined, now: Date = new Date()): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const ms = now.getTime() - d.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 維修中顯示「N 天前」（追蹤停滯用），其餘狀態顯示 MM-DD 絕對日期。 */
export function formatLastMoved(status: EquipmentStatus, dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  if (status === 'in_repair') {
    const d = daysSince(dateStr);
    return d === null ? '—' : `${d} 天前`;
  }
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function formatDateTime(dateStr: string): { date: string; time: string } {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return { date: '—', time: '' };
  return {
    date: `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
    time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
  };
}

/** 該列是否算「異常／該注意」——維修逾期或在案場逾期。 */
export function isStuckRow(status: EquipmentStatus, lastMovedAt: string | null | undefined): boolean {
  const d = daysSince(lastMovedAt);
  if (d === null) return false;
  if (status === 'in_repair') return d >= REPAIR_STUCK_DAYS;
  if (status === 'on_site') return d >= SITE_STUCK_DAYS;
  return false;
}

/** 位置軌／跳線色塊要用的顏色——3-2 顏色語意的單一事實來源。禁止新增第五色。 */
export const POSITION_SLOTS = ['storage', 'site', 'repair'] as const;
export type PositionSlot = typeof POSITION_SLOTS[number];

export const SLOT_LABEL: Record<PositionSlot, string> = {
  storage: '庫房',
  site: '案場',
  repair: '維修',
};

export function statusToSlot(status: EquipmentStatus): PositionSlot | null {
  if (status === 'in_storage') return 'storage';
  if (status === 'on_site') return 'site';
  if (status === 'in_repair') return 'repair';
  return null; // retired：不落在任何孔位
}

export interface SlotColor {
  fill: string; // 實心填色
  glow: string; // 放大版光暈
  text: string; // 對應文字色
}

export const SLOT_COLOR: Record<PositionSlot, SlotColor> = {
  storage: { fill: 'rgba(255,255,255,.55)', glow: 'rgba(255,255,255,.18)', text: 'var(--nm-text-body)' },
  site: { fill: 'var(--nm-warning)', glow: 'rgba(217,181,107,.4)', text: 'var(--nm-warning-glass-text)' },
  repair: { fill: 'var(--nm-danger)', glow: 'rgba(224,122,122,.4)', text: 'var(--nm-danger-glass-text)' },
};

export const RETIRED_COLOR = { fill: 'rgba(255,255,255,.07)', text: 'var(--nm-text-muted)' };
