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
export const TERMINAL_TOOLS = new Set(['ask_clarification', 'propose_create_task', 'propose_log_note']);

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
  {
    name: 'propose_log_note',
    description:
      '提出「記一筆工作記錄」的提案(還沒有真的寫入)。呼叫後系統會向使用者顯示確認按鈕,使用者按下確認才會真的寫入。',
    input_schema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: '必須是 search_projects 回傳的 id' },
        content: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['project_id', 'content'],
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
