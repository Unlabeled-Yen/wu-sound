import 'server-only';
import {
  AGENT_TOOLS,
  PROPOSE_ACTION,
  createHttpToolClient,
  type LlmClient,
  type ToolResult,
} from '@/lib/voice-agent-tools';
import {
  buildFields,
  cancelPending,
  confirmPending,
  handleVoiceCommand,
  matchVoiceCommand,
  normalizePayload,
  resolveProjectName,
  type AgentTurnResult,
} from '@/lib/voice-agent';
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
  /** ask_clarification 時附上,前端把候選渲染成畫面清單(語音回答為主,螢幕輔助) */
  clarify?: { question: string; options: { label: string; value: string }[] };
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

  // ask_clarification 不打 Lab 1(那邊沒有這個端點)——它的作用是把候選丟回螢幕,
  // 語音上模型自己會唸出問題,這裡只要告訴它「已顯示,等使用者回答」。
  if (name === 'ask_clarification') {
    const question = typeof args.question === 'string' ? args.question : '';
    const options = Array.isArray(args.options)
      ? (args.options as { label?: unknown; value?: unknown }[])
          .filter((o) => o && typeof o.label === 'string' && typeof o.value === 'string')
          .map((o) => ({ label: o.label as string, value: o.value as string }))
      : [];
    return {
      output: JSON.stringify({ ok: true, message_zh: '問題與候選已顯示在畫面上,請口頭唸出選項讓使用者選,然後等他回答。' }),
      clarify: { question, options },
    };
  }

  const proposeAction = PROPOSE_ACTION[name];
  if (proposeAction) {
    const normalized = normalizePayload(args);
    const result = await tools.call('propose_write', {
      action: proposeAction,
      payload: normalized.payload,
      // 語音來的提案標 voice,audit_log 才分得出這筆是誰用嘴巴記的(spec §2 稽核強化)
      source: 'voice',
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

// ---------- 語音/按鈕確認(寫入的唯一入口) ----------

/**
 * Realtime 模式沒有文字 LLM 的位置——確認/取消流程完全不需要模型參與,
 * 這個 stub 塞進 AgentDeps 佔位。若真的被呼叫,代表流程走進了不該走的分支,
 * loud 炸出來,不靜默呼叫一個不存在的模型。
 */
const NO_LLM: LlmClient = {
  async createMessage() {
    throw new Error('Realtime 確認流程不應呼叫文字 LLM——這是流程錯誤,不是模型問題');
  },
};

export interface RealtimeCommandResult {
  /**
   * confirmed=已寫入 / cancelled=已作廢 / unclear=沒聽清楚不動作 /
   * no_pending=沒有待確認項目 / failed=使用者確認了但寫入失敗(要 loud 告知,不能含糊)
   */
  outcome: 'confirmed' | 'cancelled' | 'unclear' | 'no_pending' | 'failed';
  /** 給前端顯示、也塞回對話讓模型口播的一句話 */
  reply: string;
  warning?: string;
}

/**
 * 「有沒有真的寫入」看 toolTrace 的機械事實(commit 工具呼叫成功與否),
 * 不從回覆字串反推——字串比對會把「寫入失敗」誤讀成成功,那是會說謊的判法。
 */
function toCommandResult(r: AgentTurnResult, hadPending: boolean, kind: 'confirm' | 'cancel' | 'unclear'): RealtimeCommandResult {
  const base = { reply: r.reply, ...(r.warning ? { warning: r.warning } : {}) };
  if (!hadPending) return { outcome: 'no_pending', ...base };
  if (kind === 'unclear') return { outcome: 'unclear', ...base };
  if (kind === 'cancel') return { outcome: 'cancelled', ...base };
  const committed = r.toolTrace.some((t) => (t.name === 'create_task' || t.name === 'log_note') && t.ok);
  return { outcome: committed ? 'confirmed' : 'failed', ...base };
}

/**
 * 語音逐字稿走白名單比對(matchVoiceCommand,含「不對≠對」防線)。
 * 判斷的是伺服器端 matchVoiceCommand,不是 Realtime 模型——模型嘴上說什麼都不會觸發寫入。
 */
export async function runRealtimeVoiceCommand(
  sessionId: string,
  transcript: string,
  originUrl: string,
): Promise<RealtimeCommandResult> {
  const { session } = getOrCreateSession(sessionId);
  const hadPending = session.pending !== null;
  const kind = matchVoiceCommand(transcript);
  const r = await handleVoiceCommand(session, transcript, { llm: NO_LLM, tools: createHttpToolClient(originUrl) });
  return toCommandResult(r, hadPending, kind === 'confirm' ? 'confirm' : kind === 'cancel' ? 'cancel' : 'unclear');
}

/** 螢幕按鈕的結構化確認/取消(雙軌的另一軌),不經過任何文字比對 */
export async function runRealtimeStructuredCommand(
  sessionId: string,
  action: 'confirm' | 'cancel',
  originUrl: string,
): Promise<RealtimeCommandResult> {
  const { session } = getOrCreateSession(sessionId);
  const hadPending = session.pending !== null;
  const r =
    action === 'confirm'
      ? await confirmPending(session, { llm: NO_LLM, tools: createHttpToolClient(originUrl) })
      : cancelPending(session);
  return toCommandResult(r, hadPending, action);
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
