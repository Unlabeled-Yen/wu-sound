import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import * as OpenCC from 'opencc-js';
import {
  AGENT_TOOLS,
  AgentConfigError,
  DECLINE_TEXT,
  PROPOSE_ACTION,
  READ_TOOLS,
  TERMINAL_TOOLS,
  type LlmClient,
  type LlmContentBlock,
  type LlmMessage,
  type ToolResult,
  type VoiceToolClient,
} from '@/lib/voice-agent-tools';
import { createKimiLlm } from '@/lib/voice-agent-kimi';
import { trimMessages } from '@/lib/voice-agent-session';
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
12. 全程使用繁體中文。標籤、任務標題、內容一律不可以出現簡體字。
13. 你不能直接講話,只能透過工具:要回答用 respond,要追問用 ask_clarification,
   要拒絕用 decline,要寫入用 propose_*。
14. 跟工作無關的閒聊(你喜歡什麼、講笑話、你是誰、聊天氣)一律 decline(reason='chitchat'),
   不要陪聊、不要反問使用者興趣。
   跟工作有關但你沒有工具能做的(改金額、刪資料、建新專案、查時間、查天氣、急救資訊)用
   decline(reason='unsupported_action')。
15. respond 只能講你這一輪從工具拿到的東西。沒查過就不要講——要查就先呼叫查詢工具。
16. 使用者這句話裡**沒有提到任何專案/案場名稱**,而且這段對話**也還沒有已經對齊過的專案**
   (見規則 6)時,絕對不可以把這句話裡隨便一個詞(例如「收邊」「喇叭」)當成案名去呼叫
   search_projects——那很可能只是描述內容的一部分,不是案名,拿它去搜只會搜到 0 筆、
   答非所問。這種情況要先用 ask_clarification 問清楚「這是要記到哪個專案?」,
   拿到明確案名或對話裡已經對齊過專案之後才呼叫 search_projects。
   如果這段對話已經對齊過專案,沒提到新案名就直接沿用(規則 6),不要因為這句話裡
   聽不出案名而觸發搜尋或追問。`;
}

// ---------- 工具執行 ----------

function toolResultText(result: ToolResult): string {
  if (result.ok) return JSON.stringify(result.data);
  return JSON.stringify({ error_code: result.error_code, message_zh: result.message_zh });
}

/**
 * 簡→繁轉換。用 `to: 'tw'`(只轉字形)而不是 `'twp'`(連詞彙一起換,
 * 例如「调试」→「除錯」)——換詞等於改寫使用者講的話,那不是我們該做的事;
 * 我們要處理的只是「模型寫出簡體字」這一件事。
 *
 * 為什麼需要:實測 Kimi 會把「水電」寫成「水电」存進 tags,而 wu 是全繁體系統。
 * prompt 交代過不准用簡體(規則 12),它照犯——所以改在寫入路徑上轉。
 */
const toTw = OpenCC.Converter({ from: 'cn', to: 'tw' });

export function toTraditional(value: string): string {
  return toTw(value);
}

function normalizePayload(input: Record<string, unknown>): {
  payload: Record<string, unknown>;
  converted: boolean;
} {
  const out: Record<string, unknown> = {};
  let converted = false;

  for (const [k, v] of Object.entries(input)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string') {
      if (v.trim() === '') continue;
      const tw = toTraditional(v);
      if (tw !== v) converted = true;
      out[k] = tw;
      continue;
    }
    if (Array.isArray(v)) {
      if (v.length === 0) continue;
      out[k] = v.map((item) => {
        if (typeof item !== 'string') return item;
        const tw = toTraditional(item);
        if (tw !== item) converted = true;
        return tw;
      });
      continue;
    }
    out[k] = v;
  }

  return { payload: out, converted };
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
  // 修剪在推入新訊息之後、送給模型之前——這樣切割點一定落在完整的一輪邊界上
  session.messages = trimMessages(session.messages);
  const system = buildSystemPrompt(now());
  // 這一輪有沒有查過東西。閒聊的共同特徵是「不需要查任何資料」,
  // 所以這個布林值就是「模型現在有沒有事實可講」的機械判準,不靠語意理解
  let didRead = false;

  for (let step = 0; step < MAX_STEPS; step += 1) {
    const res = await deps.llm.createMessage({
      system,
      messages: session.messages,
      tools: AGENT_TOOLS,
      toolChoice: 'any',
    });
    session.messages.push({ role: 'assistant', content: res.content });

    const toolUses = res.content.filter(
      (b): b is Extract<LlmContentBlock, { type: 'tool_use' }> => b.type === 'tool_use',
    );
    if (toolUses.length === 0) {
      // 已經強制 tool_choice 了還是回自由文字(模型不理會設定時會發生)——
      // 一樣要過閘門,沒查過東西就不讓它講
      const gated = gateFreeText(textOf(res.content), didRead);
      return { reply: gated.text, state: 'responding', toolTrace: trace, warning: gated.warning ?? warning };
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

      if (use.name === 'ask_clarification' || use.name === 'respond' || use.name === 'decline') {
        trace.push({ name: use.name, ok: true });
        resultBlocks.push({ type: 'tool_result', tool_use_id: use.id, content: '已回覆使用者,等待下一句。' });
        terminal = { use, result: null };
        continue;
      }

      const proposeAction = PROPOSE_ACTION[use.name];
      let result: ToolResult;
      if (proposeAction) {
        const normalized = normalizePayload(use.input);
        if (normalized.converted) warning = '模型產生了簡體字,已自動轉成繁體';
        result = await deps.tools.call('propose_write', {
          action: proposeAction,
          payload: normalized.payload,
          source: 'text',
        });
      } else {
        result = await deps.tools.call(use.name, use.input);
      }

      trace.push({
        name: use.name,
        ok: result.ok,
        ...(result.ok ? {} : { error_code: result.error_code }),
      });
      if (READ_TOOLS.has(use.name)) didRead = true;
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

    if (terminal && terminal.use.name === 'decline') {
      const reason = String(terminal.use.input.reason ?? 'out_of_scope');
      // 拒絕的話由系統講,模型只給分類——不讓它自己造句順便又聊起來
      return {
        reply: DECLINE_TEXT[reason] ?? DECLINE_TEXT.out_of_scope,
        state: 'responding',
        toolTrace: trace,
        warning,
      };
    }

    if (terminal && terminal.use.name === 'respond') {
      const gated = gateFreeText(String(terminal.use.input.text ?? ''), didRead);
      return {
        reply: gated.text,
        state: 'responding',
        toolTrace: trace,
        warning: gated.warning ?? warning,
      };
    }

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

/**
 * 自由文字的閘門——這是「把 agent 約束在正軌上」的主力。
 *
 * 觀察:閒聊(貓派狗派、你是誰、今天天氣)的共同特徵是**不需要查任何資料**;
 * 而合法的回答一定查過東西——要講未完成任務數就得先 list_tasks,
 * 要講專案近況就得先 get_project_summary。
 *
 * 所以規則是機械的:這一輪沒呼叫過任何讀取工具,就沒有事實可講,不准講。
 * 不依賴語意判斷、不依賴模型自律,跟「LLM 沒有寫入工具」是同一招。
 *
 * 已知取捨:使用者打「你好」也會收到這句固定文案,不會有寒暄。
 * 這是刻意的——現場工具是拿來記事情的,不是拿來聊天的。
 */
function gateFreeText(text: string, didRead: boolean): { text: string; warning?: string } {
  const trimmed = text.trim();
  if (didRead && trimmed) return { text: trimmed };
  return {
    text: DECLINE_TEXT.chitchat,
    warning: '這一輪沒有查詢任何資料,回覆已改用固定文案(防止模型自由發揮)',
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

// ---------- 語音口令確認(Lab 3 §1,雙軌的 B 軌) ----------

/**
 * 免手情境下的確認判斷。
 *
 * 語音沒有按鈕,但要守的鐵律不是「必須是按鈕」,而是
 * **確認與否不由 LLM 判斷**——按鈕只是這條鐵律在螢幕上的實作。
 * 所以這裡用白名單字串比對代替按鈕:判斷的是這個函式,不是模型。
 *
 * 比對規則刻意嚴格:
 * - **整句相等**才算,不做包含比對——「不對」包含「對」、「不可以」包含「可以」,
 *   用包含比對會把否定聽成同意,那是會寫錯資料的錯法
 * - 只剝除語尾助詞(啊/喔/啦/呢/嘛),不做任何語意推論
 * - 不在名單上的一律 unclear,包含「嗯」「應該吧」「大概」——
 *   這正是 handoff §5.4 要求的「模糊回應視為未確認」
 */
const CONFIRM_WORDS = new Set(['確認', '確定', '對', '對的', '沒錯', '可以', '沒問題', '就這樣', '是的', '好的']);
const CANCEL_WORDS = new Set(['取消', '不對', '不是', '不要', '算了', '不用', '錯了', '重來']);

export function matchVoiceCommand(transcript: string): 'confirm' | 'cancel' | 'unclear' {
  const cleaned = toTraditional(transcript)
    .replace(/[\s,。,.!!??、~～]/g, '')
    .replace(/[啊阿喔哦囉啦呢嘛耶欸]+$/u, '');
  if (!cleaned) return 'unclear';
  if (CONFIRM_WORDS.has(cleaned)) return 'confirm';
  if (CANCEL_WORDS.has(cleaned)) return 'cancel';
  return 'unclear';
}

/** 語音口令走到這裡;沒聽清楚一律不動 pending,回去再問一次 */
export async function handleVoiceCommand(
  session: AgentSession,
  transcript: string,
  deps: AgentDeps,
): Promise<AgentTurnResult> {
  if (!session.pending) {
    return { reply: '目前沒有待確認的項目。', state: 'responding', toolTrace: [] };
  }
  const cmd = matchVoiceCommand(transcript);
  if (cmd === 'confirm') return confirmPending(session, deps);
  if (cmd === 'cancel') return cancelPending(session);

  return {
    reply: '我沒聽清楚。要寫入請說「確認」,不要的話請說「取消」。',
    state: 'confirming',
    pending: { action: session.pending.action, fields: session.pending.fields },
    toolTrace: [],
    warning: `聽到的是「${transcript}」,不在確認詞名單內,沒有寫入任何東西`,
  };
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
        ...(req.tools && req.toolChoice === 'any' ? { tool_choice: { type: 'any' as const } } : {}),
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
