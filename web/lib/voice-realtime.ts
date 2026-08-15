import 'server-only';
import {
  AGENT_TOOLS,
  PROPOSE_ACTION,
  createHttpToolClient,
  type ToolResult,
} from '@/lib/voice-agent-tools';
import { buildFields, normalizePayload, resolveProjectName } from '@/lib/voice-agent';
import { getOrCreateSession } from '@/lib/voice-agent-session';
import type { PendingWrite } from '@/lib/voice-agent-session';

/**
 * Lab 3c(Realtime)工具面。
 * 規格:voice-lab/lab3c-realtime-spec-v1.md §3
 *
 * 只沿用 Lab 2 的 6 個工具,拿掉 respond/decline——那兩個工具存在的理由是
 * 「強迫每句話過工具」,Realtime 模型直接對使用者說話,這個攔截點本來就守不住,
 * 留著這兩個工具沒有意義,見規格 §2 的鐵律移植表。
 *
 * 寫入防線完全不變:模型仍然只有 propose_*,真正 commit 只發生在
 * confirmVoiceCommand()——伺服器端白名單比對到「確認」才會呼叫,
 * 跟 Lab 2 的 confirmPending() 同一套規矩,只是觸發來源從按鈕換成語音逐字稿。
 */

const REALTIME_TOOL_NAMES = new Set([
  'search_projects',
  'get_project_summary',
  'list_tasks',
  'ask_clarification',
  'propose_create_task',
  'propose_log_note',
]);

/** Realtime session.tools 是扁平格式(type/name/description/parameters 同層),
 *  跟 Chat Completions 的巢狀 {type:'function', function:{...}} 不同,不要弄混。 */
export function realtimeToolDefs(): { type: 'function'; name: string; description: string; parameters: unknown }[] {
  return AGENT_TOOLS.filter((t) => REALTIME_TOOL_NAMES.has(t.name)).map((t) => ({
    type: 'function' as const,
    name: t.name,
    description: t.description,
    parameters: t.input_schema,
  }));
}

export interface RealtimeToolCallResult {
  /** 塞回 conversation.item.create 的 function_call_output.output(JSON 字串) */
  output: string;
  /** propose 成功時附上,前端據此渲染確認卡片並記錄待確認狀態 */
  pending?: { action: 'create_task' | 'log_note'; fields: { label: string; value: string }[] };
}

/**
 * 執行一次工具呼叫。session_id 對應到瀏覽器那一通 Realtime call,
 * 用 voice-agent-session.ts 既有的 session store 存 pending 提案——
 * 跟 Lab 2 同一份型別、同一套「查不到名稱就 loud 不冒充」邏輯,不重寫一份。
 */
export async function runRealtimeTool(
  sessionId: string,
  name: string,
  args: Record<string, unknown>,
  originUrl: string,
): Promise<RealtimeToolCallResult> {
  const tools = createHttpToolClient(originUrl);
  const { session } = getOrCreateSession(sessionId);

  const proposeAction = PROPOSE_ACTION[name];
  if (proposeAction) {
    const normalized = normalizePayload(args);
    const result = await tools.call('propose_write', {
      action: proposeAction,
      payload: normalized.payload,
      source: 'text',
    });
    if (!result.ok) {
      return { output: JSON.stringify({ error_code: result.error_code, message_zh: result.message_zh }) };
    }
    const canonical = result.data.canonical_echo as Record<string, unknown> | undefined;
    const token = result.data.confirmation_token;
    if (!canonical || typeof token !== 'string') {
      return { output: JSON.stringify({ error_code: 'BAD_RESPONSE', message_zh: 'propose_write 回傳格式不對' }) };
    }
    const { name: projectName, warning } = await resolveProjectName(
      session,
      String(canonical.project_id ?? ''),
      tools,
    );
    const pending: PendingWrite = {
      action: proposeAction,
      payload: canonical,
      token,
      fields: buildFields(proposeAction, canonical, projectName),
      proposedAt: Date.now(),
    };
    session.pending = pending;
    return {
      output: JSON.stringify({
        ok: true,
        message_zh: '已產生提案,等待使用者口頭確認,不要再問一次是否同意——你只要口語複述這些欄位讓他核對。',
        fields: pending.fields,
        ...(warning ? { warning } : {}),
      }),
      pending: { action: pending.action, fields: pending.fields },
    };
  }

  if (name === 'search_projects') {
    const result = await tools.call('search_projects', args);
    rememberProjectNames(session, result);
    return { output: toolResultJson(result) };
  }

  const result = await tools.call(name, args);
  return { output: toolResultJson(result) };
}

function toolResultJson(result: ToolResult): string {
  return result.ok ? JSON.stringify(result.data) : JSON.stringify({ error_code: result.error_code, message_zh: result.message_zh });
}

function rememberProjectNames(session: ReturnType<typeof getOrCreateSession>['session'], result: ToolResult): void {
  if (!result.ok) return;
  const candidates = result.data.candidates;
  if (!Array.isArray(candidates)) return;
  for (const c of candidates) {
    if (c && typeof c === 'object') {
      const row = c as Record<string, unknown>;
      if (typeof row.id === 'string' && typeof row.name === 'string') session.projectNames[row.id] = row.name;
    }
  }
}
