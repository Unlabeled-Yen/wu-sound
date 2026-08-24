import 'server-only';

/**
 * voice-lab Lab 2 — LLM 工具面 + Lab 1 端點轉發。
 * 規格:voice-lab/lab2-text-agent-spec-v1.md §2.2 / §4
 *
 * 兩個關鍵設計(不是實作細節,是防禦邏輯):
 * 1. LLM 的工具清單裡**沒有** create_task / log_note——只有 propose_*。
 *    真正寫入是使用者按 [確認] 後由伺服器端直接呼叫(spec §4「實作硬化」),
 *    LLM 沒有機會誤判「使用者是不是同意了」。
 * 2. 缺環境變數一律 throw(loud),不靜默降級成「工具剛好都失敗」。
 */

export class AgentConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentConfigError';
  }
}

// ---------- LLM 對話型別(放這裡讓 session 與 runtime 都能引用,避免循環相依) ----------

export type LlmContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: LlmContentBlock[];
}

export interface LlmRequest {
  system: string;
  messages: LlmMessage[];
  /** 省略 tools = 這一輪禁止呼叫工具(用在「複述確認」那一步,保證拿到純文字) */
  tools?: ToolSchema[];
  /**
   * 'any' = 強迫模型一定要選一個工具,不能直接回自由文字。
   * 這是把「模型隨口聊天」這個出口關掉的第一步——它只能透過 respond/decline 說話,
   * 而那兩條路都有 runtime 的閘門把關。
   */
  toolChoice?: 'auto' | 'any';
}

export interface LlmClient {
  createMessage(req: LlmRequest): Promise<{ content: LlmContentBlock[] }>;
}

// ---------- LLM 看得到的工具 ----------

export interface ToolSchema {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/** 呼叫後這一輪對話就結束(等使用者下一個動作),不再讓 LLM 繼續推理 */
export const TERMINAL_TOOLS = new Set([
  'ask_clarification',
  'propose_create_task',
  'propose_log_note',
  'respond',
  'decline',
]);

/**
 * 讀取工具。「這一輪有沒有查過東西」是判斷閒聊的機械依據,見 voice-agent.ts 的 respond 閘門。
 *
 * 2026-08-14 移除民生/救難三個工具(Yen 確認):加入它們之後 Kimi 的辨答率明顯下降——
 * 工具從 8 個變 11 個、prompt 從 39 行變 50 行,模型判斷「該用哪個工具」的空間變大,
 * 準確度就掉了。回退到「只做 wu 現場記錄」是還原到 Yen 親自肯定過的品質,不是功能倒退。
 * 若日後真的需要民生/救難,規劃另做獨立入口的 agent,不要塞回這裡。
 */
export const READ_TOOLS = new Set(['search_projects', 'get_project_summary', 'list_tasks']);

/** 不經 Lab 1 端點、由 runtime 自己執行的工具。回退民生救難後暫時清空,結構保留給日後其他 local 工具用 */
export const LOCAL_TOOLS = new Set<string>();

/** decline 的固定文案。理由分類由模型給,話由系統講——不讓模型自己造拒絕句 */
export const DECLINE_TEXT: Record<string, string> = {
  unsupported_action: '這個操作目前不支援,請用系統介面。',
  out_of_scope: '我只能幫你查專案狀況、記工作記錄、新增任務。這件事請用系統介面處理。',
  chitchat: '我是現場記錄助理,只處理專案查詢、工作記錄和任務。有什麼要記的嗎?',
};

export const AGENT_TOOLS: ToolSchema[] = [
  {
    name: 'search_projects',
    description:
      '用關鍵字搜尋專案(工地/案場)。回傳最多 5 筆候選。任何寫入動作之前都必須先用這個工具確認專案,不可以憑記憶或猜測填 project_id。',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: '使用者講的專案名稱片段' } },
      required: ['query'],
    },
  },
  {
    name: 'list_projects',
    description:
      '列出全部進行中的專案(名稱+id),不需要關鍵字。使用者問「有哪些專案」「列出所有案子」這種沒有指定特定案名的問法時用這個,不要用 search_projects 硬塞一個猜測的關鍵字進去。',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_project_summary',
    description: '取得單一專案的概況:名稱、未完成任務數、最近幾筆工作記錄。',
    input_schema: {
      type: 'object',
      properties: { project_id: { type: 'string', description: 'search_projects 回傳的 id' } },
      required: ['project_id'],
    },
  },
  {
    name: 'list_tasks',
    description: '列出某專案的任務。',
    input_schema: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        status: { type: 'string', enum: ['open', 'done', 'all'], description: '預設 open' },
      },
      required: ['project_id'],
    },
  },
  {
    name: 'ask_clarification',
    description:
      '需要使用者補充資訊或在多筆候選中做選擇時呼叫。呼叫後這一輪就結束,等使用者回覆。搜尋結果有 2 筆以上候選時,一定要用 options 把候選列出來讓使用者點選,不可以自己挑一個看起來最像的。',
    input_schema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: '要問使用者的話(口語、繁體中文)' },
        options: {
          type: 'array',
          description: '可點選的選項(例如多筆專案候選);沒有明確選項時省略',
          items: {
            type: 'object',
            properties: { label: { type: 'string' }, value: { type: 'string' } },
            required: ['label', 'value'],
          },
        },
      },
      required: ['question'],
    },
  },
  {
    name: 'respond',
    description:
      '把最終回覆講給使用者聽。只能陳述你從工具拿到的事實,不可以憑印象講數字或狀態。注意:這一輪如果你沒有呼叫過任何查詢工具,系統會擋掉這個回覆——沒查過就沒有事實可講。',
    input_schema: {
      type: 'object',
      properties: { text: { type: 'string', description: '要對使用者說的話(口語、繁體中文)' } },
      required: ['text'],
    },
  },
  {
    name: 'decline',
    description:
      '使用者的要求超出你能做的範圍時呼叫。實際回覆文案由系統產生,你只要選對分類。閒聊、問你是誰、問天氣、跟工作無關的話題一律用 chitchat。',
    input_schema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          enum: ['unsupported_action', 'out_of_scope', 'chitchat'],
          description:
            'unsupported_action=要求改資料/刪除/查金額等系統支援但你沒有工具的操作;out_of_scope=工作相關但不在職責內;chitchat=與工作無關的閒聊',
        },
      },
      required: ['reason'],
    },
  },
  {
    name: 'propose_create_task',
    description:
      '提出「新增任務」的提案(還沒有真的寫入)。呼叫後系統會向使用者顯示確認按鈕,使用者按下確認才會真的寫入——你不需要、也不可以再自行判斷使用者是否同意。',
    input_schema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: '必須是 search_projects 回傳的 id' },
        title: { type: 'string' },
        description: { type: 'string' },
        due_date: { type: 'string', description: 'YYYY-MM-DD,口語相對日期要先換算' },
      },
      required: ['project_id', 'title'],
    },
  },
];

/** LLM 工具名 → Lab 1 propose_write 的 action */
export const PROPOSE_ACTION: Record<string, 'create_task' | 'log_note'> = {
  propose_create_task: 'create_task',
  propose_log_note: 'log_note',
};

// ---------- Lab 1 端點轉發 ----------

export type ToolOk = { ok: true; data: Record<string, unknown> };
export type ToolFail = { ok: false; status: number; error_code: string; message_zh: string };
export type ToolResult = ToolOk | ToolFail;

export interface VoiceToolClient {
  /** 呼叫 Lab 1 的 `POST /api/voice/tools/[tool]`;tool 名是契約上的名字,不是 LLM 工具名 */
  call(tool: string, body: Record<string, unknown>): Promise<ToolResult>;
}

/**
 * 走 HTTP 打自己家的 Lab 1 端點(server-to-server,帶 VOICE_API_KEY)。
 * 刻意不直接 import route handler 或直連 DB——契約是唯一入口,
 * 這樣 Lab 2 就不可能繞過兩階段 token 或 actor 檢查(spec §2.2)。
 */
export function createHttpToolClient(fallbackBaseUrl?: string): VoiceToolClient {
  const apiKey = process.env.VOICE_API_KEY;
  if (!apiKey) {
    throw new AgentConfigError('voice agent 尚未設定(缺 VOICE_API_KEY)');
  }
  // 環境變數優先(部署環境應該明講自己的網址,不看 Host header——
  // 那是可以被偽造的,而我們會把 VOICE_API_KEY 送到這個網址去)。
  // 沒設時退回呼叫端自己的 origin:agent route 跟工具端點本來就同一個 app,
  // 少一個必填設定就少一種「本機好好的、上線壞掉」的失敗模式。
  const base = process.env.VOICE_TOOLS_BASE_URL || fallbackBaseUrl;
  if (!base) {
    throw new AgentConfigError(
      'voice agent 尚未設定(缺 VOICE_TOOLS_BASE_URL,例如 http://localhost:3000)',
    );
  }
  const root = base.replace(/\/+$/, '');

  return {
    async call(tool, body) {
      let res: Response;
      try {
        res = await fetch(`${root}/api/voice/tools/${tool}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(body),
        });
      } catch (e) {
        // 連不上自己家的端點是基礎設施問題,不是「這個工具沒東西」——要 loud
        return {
          ok: false,
          status: 0,
          error_code: 'TOOL_UNREACHABLE',
          message_zh: `無法連線到工具端點: ${e instanceof Error ? e.message : String(e)}`,
        };
      }

      let json: unknown = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }
      const obj = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;

      if (!res.ok) {
        return {
          ok: false,
          status: res.status,
          error_code: typeof obj.error_code === 'string' ? obj.error_code : 'UNKNOWN',
          message_zh:
            typeof obj.message_zh === 'string' ? obj.message_zh : `工具回傳 HTTP ${res.status}`,
        };
      }
      return { ok: true, data: obj };
    },
  };
}
