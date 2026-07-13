import type { EquipmentStatus } from './types';

export interface MoveInput {
  to_status: EquipmentStatus;
  to_site_id: string | null;
  current_status: EquipmentStatus;
  current_site_id: string | null;
}

/**
 * Validate a move request. Returns an error message (Chinese) or null if ok.
 * Server is source of truth; client uses this to enable/disable submit.
 */
export function validateMove(input: MoveInput): string | null {
  const { to_status, to_site_id, current_status, current_site_id } = input;
  if (to_status === 'on_site') {
    if (!to_site_id) return '案場中必須選擇案場';
  } else {
    if (to_site_id) return '此狀態不可有案場';
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
