import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import {
  AGENT_TOOLS,
  AgentConfigError,
  PROPOSE_ACTION,
  TERMINAL_TOOLS,
  type LlmClient,
  type LlmContentBlock,
  type LlmMessage,
  type ToolResult,
  type VoiceToolClient,
} from '@/lib/voice-agent-tools';
import { createKimiLlm } from '@/lib/voice-agent-kimi';
import type { AgentSession, PendingField, PendingWrite } from '@/lib/voice-agent-session';

export type {
  LlmClient,
  LlmContentBlock,
  LlmMessage,
  LlmRequest,
  ToolResult,
  ToolSchema,
  VoiceToolClient,
} from '@/lib/voice-agent-tools';

/**
 * voice-lab Lab 2 — Agent runtime。
 * 規格:voice-lab/lab2-text-agent-spec-v1.md §2(runtime)/ §3(實體對齊)/ §4(確認流程)
 *
 * 鐵律(寫在程式結構裡,不是靠 prompt 求 LLM 乖):
 * - LLM 拿不到 create_task / log_note,只拿得到 propose_*;真正寫入只在 confirmPending() 發生
 * - confirmPending() 只在使用者按下 [確認] 這個結構化事件時被呼叫,不解讀自由文字語意
 * - 送 commit 的 payload 一律用 propose 回傳的 canonical_echo 原封不動,不重組(否則 hash 對不上)
 */

const DEFAULT_MODEL = process.env.VOICE_AGENT_MODEL ?? 'claude-sonnet-4-5';
const MAX_TOKENS = 1024;
/** 一輪對話最多讓 LLM 來回呼叫幾次工具;超過視為異常,loud 回報不靜默截斷 */
const MAX_STEPS = 8;

export type AgentState = 'clarifying' | 'confirming' | 'responding';

export interface AgentOption {
  label: string;
  value: string;
}

export interface AgentTurnResult {
  reply: string;
  state: AgentState;
  /** clarifying 時的可點選候選(例如多筆專案),UI 渲染成按鈕 */
  options?: AgentOption[];
  /** confirming 時給 UI 顯示的結構化欄位;token 不外露 */
  pending?: { action: 'create_task' | 'log_note'; fields: PendingField[] };
  /** 這一輪呼叫過哪些工具、成功與否——驗證對話品質時要看得到,不是黑盒 */
  toolTrace: { name: string; ok: boolean; error_code?: string }[];
  /** 非致命但使用者該知道的異常(逾時重提案、名稱查詢失敗、步數上限) */
  warning?: string;
}

export interface AgentDeps {
  llm: LlmClient;
  tools: VoiceToolClient;
  now?: () => number;
}

// ---------- system prompt ----------

export function todayInTaipei(now: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(now));
}

export function buildSystemPrompt(now: number): string {
  return `你是 wu 音響工程公司的現場助理,用繁體中文口語跟員工/老闆對話,幫他們把口述的事情記進系統。

硬規則(不是建議,是限制):
1. 絕對不能自己編造 project_id,一律用 search_projects 回傳的 id。
2. 使用者要求「記一筆」或「新增任務」前,必須先呼叫 search_projects 確認專案。
   搜尋結果 0 筆 → 用 ask_clarification 說找不到,問要不要換個說法,並告知新增專案請用系統介面。
   搜尋結果 2 筆以上 → 用 ask_clarification 附上 options 讓使用者選,不可以自己挑一個看起來最像的。
   搜尋結果 1 筆 → 可以採用,但提案時要講出完整案名讓使用者有機會糾正。
3. 寫入一律走 propose_create_task / propose_log_note。你沒有直接寫入的工具,
   也不需要判斷使用者是否同意——系統會顯示確認按鈕,使用者按下才會寫入。
4. 今天是 ${todayInTaipei(now)},時區 Asia/Taipei。口語相對日期(「下週三」「月底前」)
   要換算成 YYYY-MM-DD 再放進 payload,複述時也要講絕對日期。
5. 使用者要求的操作若不在工具清單裡(改資料、刪除、查金額、建新專案),
   明確回覆「這個操作目前不支援,請用系統介面」,不要假裝做了。
6. 同一段對話裡,上一輪已經對齊過的專案可以直接沿用它的 id,不用重新搜尋;
   但使用者提到不同專案名稱時要重新 search_projects。
7. 使用者一次講兩件事,一次只處理一件,先完成第一件的確認流程,再處理第二件。
8. 呼叫 propose_* 之後,那筆東西**還沒有寫進系統**。複述時的措辭必須是「要不要記…?」
   「幫你記到…,對嗎?」這種待確認語氣,絕對不可以用「已經」開頭,
   也不可以講成「已經記了」「已經新增了」「已經幫你開好」。
   不可以提到確認碼、token、有效期限或任何系統內部識別碼——使用者只該看到
   專案全名、動作、內容、日期。
9. 需要使用者補資訊或做選擇時,一定要呼叫 ask_clarification,不要只回一段文字問問題。
10. 遇到口語相對日期:自己換算成 YYYY-MM-DD 之後**直接發提案**,不要為了確認日期
   而停下來反問——系統顯示的確認卡片會把日期連同星期幾一起列出來給使用者核對,
   使用者本來就有機會在按確認前糾正你。複述時把日期講清楚(例如「8 月 19 日」)。
11. 只要你的回覆裡要問「對嗎?」「可以嗎?」這種請求確認的話,就表示你正在請求確認,
   那你**一定要先呼叫 propose_create_task 或 propose_log_note**。沒有呼叫就問「對嗎」,
   使用者根本看不到確認按鈕,等於這件事永遠不會發生。
12. 全程使用繁體中文。標籤、任務標題、內容一律不可以出現簡體字。`;
}

// ---------- 工具執行 ----------

function toolResultText(result: ToolResult): string {
  if (result.ok) return JSON.stringify(result.data);
  return JSON.stringify({ error_code: result.error_code, message_zh: result.message_zh });
}

function normalizePayload(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

/** 記住 search 結果的 id→名稱,複述與結果卡片才不用再多打一次 API */
function rememberProjects(session: AgentSession, result: ToolResult): void {
  if (!result.ok) return;
  const candidates = result.data.candidates;
  if (!Array.isArray(candidates)) return;
  for (const c of candidates) {
    if (c && typeof c === 'object') {
      const row = c as Record<string, unknown>;
      if (typeof row.id === 'string' && typeof row.name === 'string') {
        session.projectNames[row.id] = row.name;
      }
    }
  }
}

async function resolveProjectName(
  session: AgentSession,
  projectId: string,
  tools: VoiceToolClient,
): Promise<{ name: string; warning?: string }> {
  const cached = session.projectNames[projectId];
  if (cached) return { name: cached };
  const res = await tools.call('get_project_summary', { project_id: projectId });
  if (res.ok && typeof res.data.name === 'string') {
    session.projectNames[projectId] = res.data.name;
    return { name: res.data.name };
  }
  // 查不到名字不能拿 id 冒充案名——寧可明講查詢失敗,也不顯示一個看起來像案名的東西
  return {
    name: `(專案名稱查詢失敗,id=${projectId})`,
    warning: `無法取得專案名稱(${res.ok ? '回傳缺 name 欄位' : res.message_zh})`,
  };
}

const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'];

/**
 * 期限欄位補上星期幾。這個星期幾是 runtime 自己從日期算的,不是 LLM 講的——
 * 模型換算相對日期時算錯一天是實測會發生的事(Kimi 把「下週三」算成 08-20,
 * 那天其實是星期四),把星期幾秀在卡片上,使用者一眼就看得出對不對。
 */
export function formatDueDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const day = new Date(`${value}T12:00:00+08:00`).getDay();
  return `${value}(週${WEEKDAY[day]})`;
}

function buildFields(
  action: 'create_task' | 'log_note',
  payload: Record<string, unknown>,
  projectName: string,
): PendingField[] {
  const fields: PendingField[] = [
    { label: '專案', value: projectName },
    { label: '動作', value: action === 'create_task' ? '新增任務' : '記一筆工作記錄' },
  ];
  if (action === 'create_task') {
    fields.push({ label: '任務', value: String(payload.title ?? '') });
    if (payload.description) fields.push({ label: '說明', value: String(payload.description) });
    fields.push({
      label: '期限',
      value: payload.due_date ? formatDueDate(String(payload.due_date)) : '未指定',
    });
  } else {
    fields.push({ label: '內容', value: String(payload.content ?? '') });
    if (Array.isArray(payload.tags) && payload.tags.length > 0) {
      fields.push({ label: '標籤', value: (payload.tags as string[]).join('、') });
    }
  }
  return fields;
}

// ---------- 主迴圈 ----------

function textOf(blocks: LlmContentBlock[]): string {
  return blocks
    .filter((b): b is Extract<LlmContentBlock, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

export async function runAgentTurn(
  session: AgentSession,
  userText: string,
  deps: AgentDeps,
): Promise<AgentTurnResult> {
  const now = deps.now ?? Date.now;
  const trace: AgentTurnResult['toolTrace'] = [];
  let warning: string | undefined;

  // 還有待確認提案時,使用者又打了新訊息 → 舊提案作廢(spec §4:payload 被改動要重走一次)
  if (session.pending) {
    session.pending = null;
    session.messages.push({
      role: 'user',
      content: [{ type: 'text', text: '[系統] 使用者在確認前又輸入了新訊息,上一個提案已作廢,尚未寫入任何東西。' }],
    });
  }

  session.messages.push({ role: 'user', content: [{ type: 'text', text: userText }] });
  const system = buildSystemPrompt(now());

  for (let step = 0; step < MAX_STEPS; step += 1) {
    const res = await deps.llm.createMessage({ system, messages: session.messages, tools: AGENT_TOOLS });
    session.messages.push({ role: 'assistant', content: res.content });

    const toolUses = res.content.filter(
      (b): b is Extract<LlmContentBlock, { type: 'tool_use' }> => b.type === 'tool_use',
    );
    if (toolUses.length === 0) {
      return { reply: textOf(res.content), state: 'responding', toolTrace: trace, warning };
    }

    const resultBlocks: LlmContentBlock[] = [];
    let terminal: { use: (typeof toolUses)[number]; result: ToolResult | null } | null = null;

    for (const use of toolUses) {
      if (terminal) {
        // 已經有終結工具了,同一輪其餘工具不執行——但 Anthropic 要求每個 tool_use
        // 都要有對應的 tool_result,所以補一個明講「沒有執行」的結果,不留懸空。
        resultBlocks.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: '未執行:同一輪已有需要等待使用者的動作,請在使用者回覆後再處理。',
        });
        continue;
      }

      if (use.name === 'ask_clarification') {
        trace.push({ name: use.name, ok: true });
        resultBlocks.push({ type: 'tool_result', tool_use_id: use.id, content: '已向使用者提問,等待回覆。' });
        terminal = { use, result: null };
        continue;
      }

      const proposeAction = PROPOSE_ACTION[use.name];
      const result = proposeAction
        ? await deps.tools.call('propose_write', {
            action: proposeAction,
            payload: normalizePayload(use.input),
            source: 'text',
          })
        : await deps.tools.call(use.name, use.input);

      trace.push({
        name: use.name,
        ok: result.ok,
        ...(result.ok ? {} : { error_code: result.error_code }),
      });
      if (use.name === 'search_projects') rememberProjects(session, result);
      resultBlocks.push({
        type: 'tool_result',
        tool_use_id: use.id,
        content: toolResultText(result),
        ...(result.ok ? {} : { is_error: true }),
      });

      // 提案「成功」才是終結;失敗要把錯誤餵回去讓 LLM 自己處理(例如專案不存在 → 重新追問)
      if (proposeAction && result.ok) terminal = { use, result };
    }

    session.messages.push({ role: 'user', content: resultBlocks });

    if (terminal && terminal.use.name === 'ask_clarification') {
      const input = terminal.use.input;
      const question = typeof input.question === 'string' ? input.question : '';
      const preface = textOf(res.content);
      const options = parseOptions(input.options);
      return {
        reply: [preface, question].filter(Boolean).join('\n').trim() || '請問要記到哪個專案?',
        state: 'clarifying',
        ...(options.length > 0 ? { options } : {}),
        toolTrace: trace,
        warning,
      };
    }

    if (terminal && terminal.result?.ok) {
      const action = PROPOSE_ACTION[terminal.use.name];
      const payload = terminal.result.data.canonical_echo;
      const token = terminal.result.data.confirmation_token;
      if (!payload || typeof payload !== 'object' || typeof token !== 'string') {
        // 契約說一定有這兩個欄位;沒有就是端點壞了,不能自己編一個 token 硬走下去
        throw new AgentConfigError('propose_write 回傳缺少 confirmation_token / canonical_echo');
      }
      const canonical = payload as Record<string, unknown>;
      const { name, warning: nameWarning } = await resolveProjectName(
        session,
        String(canonical.project_id ?? ''),
        deps.tools,
      );
      if (nameWarning) warning = nameWarning;

      const pending: PendingWrite = {
        action,
        payload: canonical,
        token,
        fields: buildFields(action, canonical, name),
        proposedAt: now(),
      };
      session.pending = pending;

      // 複述那一句不給工具,保證拿到純文字(不會又冒出一個 tool_use 卡住流程)
      const recap = await deps.llm.createMessage({ system, messages: session.messages });
      session.messages.push({ role: 'assistant', content: recap.content });
      const safe = safeRecap(textOf(recap.content), pending);
      if (safe.leaked) warning = 'AI 的複述夾帶了系統識別碼,已改用系統產生的說明(實測 Kimi 會唸出確認碼)';

      return {
        reply: `${PENDING_PREFIX}\n${safe.text}`,
        state: 'confirming',
        pending: { action: pending.action, fields: pending.fields },
        toolTrace: trace,
        warning,
      };
    }
  }

  // 走到這裡代表 LLM 一直在呼叫工具沒有收斂——不假裝有答案,明講異常
  return {
    reply: '這次處理繞了太多圈沒有結論,已經停下來,沒有寫入任何東西。請換個說法再試一次。',
    state: 'responding',
    toolTrace: trace,
    warning: `已達工具呼叫上限(${MAX_STEPS} 步)`,
  };
}

function parseOptions(raw: unknown): AgentOption[] {
  if (!Array.isArray(raw)) return [];
  const out: AgentOption[] = [];
  for (const item of raw) {
    if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      if (typeof o.label === 'string' && typeof o.value === 'string') {
        out.push({ label: o.label, value: o.value });
      }
    }
  }
  return out;
}

/**
 * 待確認的提示前綴。
 *
 * 為什麼要寫死一句:實測 Kimi 有一定比例會複述成「已經幫你記了一筆」,
 * 但那當下根本還沒寫入。使用者若當真,就不會去按確認,這件事等於沒發生
 * ——而且他以為做完了。prompt 規則擋不住(加了規則仍會犯),
 * 所以由 runtime 補一句不會說謊的話,模型那句放在後面當口語補充。
 */
const PENDING_PREFIX = '⏳ 還沒寫入,請確認:';

function buildFallbackRecap(pending: PendingWrite): string {
  return pending.fields.map((f) => `${f.label}:${f.value}`).join(';');
}

const ANY_UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * 複述句的安全閘。confirmation_token 不該出現在使用者眼前(spec §4),
 * 但這件事靠 prompt 交代並不可靠——實測 Kimi 會把確認碼直接唸出來。
 * 所以在程式層擋:複述裡出現任何 UUID 就整句丟掉,改用系統自己生的說明。
 */
function safeRecap(text: string, pending: PendingWrite): { text: string; leaked: boolean } {
  if (!text.trim()) return { text: buildFallbackRecap(pending), leaked: false };
  if (ANY_UUID_RE.test(text)) return { text: buildFallbackRecap(pending), leaked: true };
  return { text, leaked: false };
}

// ---------- 確認 / 取消(結構化事件,不解讀自由文字) ----------

export async function confirmPending(session: AgentSession, deps: AgentDeps): Promise<AgentTurnResult> {
  const pending = session.pending;
  if (!pending) {
    return { reply: '目前沒有待確認的項目。', state: 'responding', toolTrace: [] };
  }
  const trace: AgentTurnResult['toolTrace'] = [];
  let warning: string | undefined;

  let result = await commit(deps.tools, pending, trace);

  // 提案 token 只有 60 秒 TTL,但使用者盯著按鈕想三分鐘很正常。
  // 逾時就用**完全相同的 payload** 重提一次再寫入——安全的前提是:
  // 這個 token 從頭到尾只有伺服器端用過,pending 一旦成功寫入就會被清掉,
  // 所以「已用過的 token」不可能出現在這裡,重提不會造成重複寫入。
  if (!result.ok && result.error_code === 'TOKEN_INVALID') {
    const re = await deps.tools.call('propose_write', {
      action: pending.action,
      payload: pending.payload,
      source: 'text',
    });
    trace.push({ name: 'propose_write(重新提案)', ok: re.ok, ...(re.ok ? {} : { error_code: re.error_code }) });
    if (re.ok && typeof re.data.confirmation_token === 'string') {
      pending.token = re.data.confirmation_token;
      result = await commit(deps.tools, pending, trace);
      warning = '確認碼已逾時,系統用相同內容重新提案後才寫入。';
    }
  }

  if (!result.ok) {
    session.pending = null;
    session.messages.push({
      role: 'user',
      content: [
        {
          type: 'text',
          text: `[系統] 使用者按了確認,但寫入失敗(${result.error_code}:${result.message_zh}),沒有寫入任何東西。`,
        },
      ],
    });
    return {
      reply: `寫入失敗,沒有記錄任何東西:${result.message_zh}(${result.error_code})`,
      state: 'responding',
      toolTrace: trace,
      warning: '寫入失敗',
    };
  }

  const id = (result.data.task_id ?? result.data.note_id) as string | undefined;
  session.pending = null;
  session.messages.push({
    role: 'user',
    content: [
      {
        type: 'text',
        text: `[系統] 使用者按下確認,已寫入:${JSON.stringify({ action: pending.action, payload: pending.payload, id })}`,
      },
    ],
  });

  const what = pending.action === 'create_task' ? '任務' : '工作記錄';
  const projectName = pending.fields.find((f) => f.label === '專案')?.value ?? '';
  return {
    reply: `已記錄到「${projectName}」的${what}。`,
    state: 'responding',
    toolTrace: trace,
    warning,
  };
}

async function commit(
  tools: VoiceToolClient,
  pending: PendingWrite,
  trace: AgentTurnResult['toolTrace'],
): Promise<ToolResult> {
  // payload 必須是 propose 回傳的 canonical_echo 原樣 + token,少一個鍵多一個鍵
  // 都會讓契約層的 payload hash 比對失敗(TOKEN_PAYLOAD_MISMATCH)
  const res = await tools.call(pending.action, {
    ...pending.payload,
    confirmation_token: pending.token,
  });
  trace.push({ name: pending.action, ok: res.ok, ...(res.ok ? {} : { error_code: res.error_code }) });
  return res;
}

export function cancelPending(session: AgentSession): AgentTurnResult {
  if (!session.pending) {
    return { reply: '目前沒有待確認的項目。', state: 'responding', toolTrace: [] };
  }
  session.pending = null;
  session.messages.push({
    role: 'user',
    content: [{ type: 'text', text: '[系統] 使用者取消了這個提案,沒有寫入任何東西。' }],
  });
  return { reply: '好的,已取消,沒有寫入任何東西。', state: 'responding', toolTrace: [] };
}

// ---------- Anthropic 實作 ----------

/**
 * 供應商選擇,沿用 lib/ai-quote.ts 既有的慣例:有 Anthropic key 就優先用它,
 * 否則退到 Kimi。兩個都沒有 → loud 拋錯,不靜默降級。
 * 回傳值第二欄是實際用的供應商,呼叫端可以據此告訴使用者現在誰在講話。
 */
export function createLlmClient(): { llm: LlmClient; provider: 'anthropic' | 'kimi' } {
  if (process.env.ANTHROPIC_API_KEY) return { llm: createAnthropicLlm(), provider: 'anthropic' };
  if (process.env.KIMI_API_KEY) return { llm: createKimiLlm(), provider: 'kimi' };
  throw new AgentConfigError('voice agent 尚未設定(缺 ANTHROPIC_API_KEY 或 KIMI_API_KEY)');
}

export function createAnthropicLlm(): LlmClient {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new AgentConfigError('voice agent 尚未設定(缺 ANTHROPIC_API_KEY)');
  const client = new Anthropic({ apiKey });

  return {
    async createMessage(req) {
      const res = await client.messages.create({
        model: DEFAULT_MODEL,
        max_tokens: MAX_TOKENS,
        system: req.system,
        messages: req.messages as unknown as Anthropic.MessageParam[],
        ...(req.tools ? { tools: req.tools as unknown as Anthropic.Tool[] } : {}),
      });
      const content: LlmContentBlock[] = [];
      for (const block of res.content) {
        if (block.type === 'text') content.push({ type: 'text', text: block.text });
        else if (block.type === 'tool_use') {
          content.push({
            type: 'tool_use',
            id: block.id,
            name: block.name,
            input: (block.input ?? {}) as Record<string, unknown>,
          });
        }
      }
      return { content };
    },
  };
}

export { AgentConfigError } from '@/lib/voice-agent-tools';
export type { AgentSession, PendingField, PendingWrite } from '@/lib/voice-agent-session';
