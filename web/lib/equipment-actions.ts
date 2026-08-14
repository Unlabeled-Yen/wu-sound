import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

// 「編輯基本資料」跟「淘汰設備」原本各有兩份實作(server action 給 UI 表單用、
// API route 給外部呼叫用),行為已經開始不一致(diff 判斷邏輯不同)。抽成這裡
// 共用一份,兩邊都呼叫同一個函式,不會再各自維護一份可能漂移的邏輯。

export interface DiffResult {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

/**
 * 只把「值真的變了」的欄位放進 before/after——不是「請求裡出現的欄位」都算變更。
 * 兩套呼叫路徑(表單/API)都用這個,audit_log 的品質才會一致。
 */
export function computeChangedFields(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): DiffResult {
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const k of Object.keys(patch)) {
    if (current[k] !== patch[k]) {
      before[k] = current[k];
      after[k] = patch[k];
    }
  }
  return { before, after };
}

export interface RetireResult {
  ok: boolean;
  error?: string;
}

/**
 * 淘汰設備的唯一實作。呼叫端(server action、API route)只負責權限檢查跟參數解析,
 * 真正的業務邏輯(狀態檢查、寫 equipment_movements、寫 audit_log)只在這裡寫一次。
 */
export async function retireEquipmentCore(
  sb: SupabaseClient,
  id: string,
  actorId: string,
): Promise<RetireResult> {
  const cur = await sb.from('equipment').select('*').eq('id', id).maybeSingle();
  if (cur.error) return { ok: false, error: `查詢失敗: ${cur.error.message}` };
  if (!cur.data) return { ok: false, error: '找不到設備' };
  if (cur.data.status === 'retired') return { ok: false, error: '此設備已淘汰' };

  const before = { status: cur.data.status, current_site_id: cur.data.current_site_id };
  const after = { status: 'retired' as const, current_site_id: null };

  const upd = await sb.from('equipment').update(after).eq('id', id);
  if (upd.error) return { ok: false, error: `淘汰失敗: ${upd.error.message}` };

  await sb.from('equipment_movements').insert({
    equipment_id: id,
    moved_by: actorId,
    from_status: before.status,
    to_status: 'retired',
    from_site_id: before.current_site_id,
    to_site_id: null,
    notes: '軟刪除:淘汰',
  });

  await sb.from('audit_log').insert({
    actor_id: actorId,
    action: 'equipment.retire',
    target_table: 'equipment',
    target_id: id,
    diff: { before, after },
  });

  return { ok: true };
}
