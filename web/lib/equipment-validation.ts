import type { EquipmentStatus } from './types';

export interface MoveInput {
  to_status: EquipmentStatus;
  to_site_id: string | null;
  current_status: EquipmentStatus;
  current_site_id: string | null;
}

// 狀態機的合法轉移。retired 是終態——設備淘汰後不可能透過「移動」功能復活,
// 想再啟用必須走「重新登記」(新增一筆設備)。in_storage/on_site/in_repair
// 三者之間可任意互轉(維修完回庫房、直接調去下一個案場都是常見操作)。
const LEGAL_TRANSITIONS: Record<EquipmentStatus, EquipmentStatus[]> = {
  in_storage: ['on_site', 'in_repair', 'retired'],
  on_site: ['in_storage', 'in_repair', 'retired'],
  in_repair: ['in_storage', 'on_site', 'retired'],
  retired: [],
};

/**
 * Validate a move request. Returns an error message (Chinese) or null if ok.
 * Server is source of truth; client uses this to enable/disable submit.
 */
export function validateMove(input: MoveInput): string | null {
  const { to_status, to_site_id, current_status, current_site_id } = input;
  if (current_status === 'retired') {
    return '已淘汰的設備不可再移動,如需重新啟用請重新登記一筆新的設備';
  }
  if (!LEGAL_TRANSITIONS[current_status].includes(to_status)) {
    return `不可從「${current_status}」轉移到「${to_status}」`;
  }
  if (to_status === 'on_site') {
    if (!to_site_id) return '專案中必須選擇專案';
  } else {
    if (to_site_id) return '此狀態不可有專案';
  }
  if (to_status === current_status && (to_site_id ?? null) === (current_site_id ?? null)) {
    return '狀態未改變';
  }
  return null;
}

export const EQUIPMENT_STATUS_ORDER: Record<EquipmentStatus, number> = {
  in_storage: 0,
  on_site: 1,
  in_repair: 2,
  retired: 3,
};
