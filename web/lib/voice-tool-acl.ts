import type { Capability } from './acl';

/**
 * 工具名 → 所需能力。這是 AI 工具面的權限單一事實來源,能力名沿用
 * lib/acl.ts 那份(不另開一套),AI 的讀寫權限跟人走 UI 時完全一致。
 *
 * 這張表跟 dispatcher(app/api/voice/tools/[tool]/route.ts)實際分派的工具名
 * 一一對應,voice-tool-acl.test.ts 會拿 route.ts 原始碼比對,確保沒有工具
 * 漏登記——跟 acl.test.ts 走 app/ 目錄確保沒有路由漏登記是同一種精神。
 */
export const TOOL_CAPABILITIES: Record<string, Capability> = {
  search_projects: 'sites',
  list_projects: 'sites',
  get_project_summary: 'sites',
  list_tasks: 'sites',
  create_task: 'sites',
  // propose_write 不在這裡——它的能力由 body.action 決定,見 PROPOSE_ACTION_CAPABILITIES
};

/** dispatcher 實際分派的工具名清單,供測試比對——來源必須跟上面那張表一致,不能各算各的 */
export const KNOWN_TOOLS: readonly string[] = [...Object.keys(TOOL_CAPABILITIES), 'propose_write'];

/** propose_write 的 action → 所需能力(propose 跟真正 commit 的那個工具必須同能力) */
export const PROPOSE_ACTION_CAPABILITIES: Record<string, Capability> = {
  create_task: 'sites',
};

/**
 * 回傳這次呼叫所需的能力;工具沒登記在表裡回 null(預設拒絕,不是預設放行)。
 * propose_write 依 body.action 決定,action 不認識也回 null——
 * 這樣「忘了幫新 action 登記能力」的結果是這個 action 完全打不進來,
 * 而不是悄悄套用某個預設能力。
 */
export function capabilityForTool(tool: string, body: Record<string, unknown>): Capability | null {
  if (tool === 'propose_write') {
    const action = typeof body.action === 'string' ? body.action : '';
    return PROPOSE_ACTION_CAPABILITIES[action] ?? null;
  }
  return TOOL_CAPABILITIES[tool] ?? null;
}
