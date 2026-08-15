import 'server-only';
import { todayInTaipei } from '@/lib/voice-agent';

/**
 * voice-lab Realtime 語音版的工具面。跟 lib/voice-agent-tools.ts(Lab 2 文字版)
 * 用同一組 Lab 1 端點跟同一套安全設計,只是把 Anthropic 的 input_schema 格式
 * 換成 OpenAI Realtime 的 function-calling 格式(parameters 不是 input_schema,
 * 且是攤平的 tools 陣列,不包一層 name/description)。
 *
 * 跟 Lab 2 一樣的關鍵防禦:工具清單裡沒有 create_task / log_note / confirm /
 * cancel——模型只能呼叫 propose_create_task / propose_log_note。真正的確認
 * 由客戶端對「使用者語音轉出的文字」做關鍵字比對(不是 AI 語意判斷),見
 * app/voice-lab-realtime/RealtimeClient.tsx 的 CONFIRM_WORDS/CANCEL_WORDS。
 * 模型完全沒有機會誤判「使用者是不是同意了」——它連嘗試的工具都沒有。
 */

export interface RealtimeToolSchema {
  type: 'function';
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const REALTIME_TOOLS: RealtimeToolSchema[] = [
  {
    type: 'function',
    name: 'search_projects',
    description:
      '用關鍵字搜尋專案(工地/案場)。回傳最多 5 筆候選。任何寫入動作之前都必須先用這個工具確認專案,不可以憑記憶或猜測填 project_id。',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: '使用者講的專案名稱片段' } },
      required: ['query'],
    },
  },
  {
    type: 'function',
    name: 'get_project_summary',
    description: '取得單一專案的概況:名稱、未完成任務數、最近幾筆工作記錄。',
    parameters: {
      type: 'object',
      properties: { project_id: { type: 'string', description: 'search_projects 回傳的 id' } },
      required: ['project_id'],
    },
  },
  {
    type: 'function',
    name: 'list_tasks',
    description: '列出某專案的任務。',
    parameters: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        status: { type: 'string', enum: ['open', 'done', 'all'], description: '預設 open' },
      },
      required: ['project_id'],
    },
  },
  {
    type: 'function',
    name: 'propose_create_task',
    description:
      '提出「新增任務」的提案(還沒有真的寫入)。呼叫後你要把提案內容口頭複述給使用者聽,等使用者明確用語音講「對/確認/好」——系統會自己判斷使用者是否確認,你不需要、也不可以自己認定使用者已經同意。',
    parameters: {
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
    type: 'function',
    name: 'propose_log_note',
    description:
      '提出「記一筆工作記錄」的提案(還沒有真的寫入)。呼叫後你要把提案內容口頭複述給使用者聽,等使用者明確用語音講「對/確認/好」。',
    parameters: {
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

/** LLM 工具名 → Lab 1 propose_write 的 action(跟 voice-agent-tools.ts 的 PROPOSE_ACTION 同一份對應) */
export const REALTIME_PROPOSE_ACTION: Record<string, 'create_task' | 'log_note'> = {
  propose_create_task: 'create_task',
  propose_log_note: 'log_note',
};

export const READ_TOOL_NAMES = new Set(['search_projects', 'get_project_summary', 'list_tasks']);

/**
 * 跟 buildSystemPrompt(voice-agent.ts,Lab 2 文字版)同一套硬規則,拿掉「你不能
 * 直接講話,只能透過工具」那條(Realtime 模型本來就用語音直接對話,respond/
 * ask_clarification/decline 這三個工具在這裡不存在),換成「確認由使用者口頭
 * 講固定詞、系統做關鍵字比對」的說明。
 */
export function buildRealtimeInstructions(now: number): string {
  return `你是 wu 音響工程公司的現場助理,用繁體中文口語跟員工/老闆對話,幫他們把口述的事情記進系統。這是即時語音通話,直接開口回答就好,不用透過任何工具講話。

硬規則(不是建議,是限制):
1. 絕對不能自己編造 project_id,一律用 search_projects 回傳的 id。
2. 使用者要求「記一筆」或「新增任務」前,必須先呼叫 search_projects 確認專案。
   搜尋結果 0 筆 → 口頭說找不到,問要不要換個說法,並告知新增專案請用系統介面。
   搜尋結果 2 筆以上 → 把候選案名一一唸出來讓使用者選,不可以自己挑一個看起來最像的。
   搜尋結果 1 筆 → 可以採用,但提案時要講出完整案名讓使用者有機會糾正。
3. 寫入一律走 propose_create_task / propose_log_note。你沒有直接寫入的工具,
   也不需要、也不可以判斷使用者是否同意——系統會對使用者接下來講的話做關鍵字比對,
   只有明確講出「對」「確認」「好」這類詞才會真的寫入,你講「好像同意了」不算數。
4. 今天是 ${todayInTaipei(now)},時區 Asia/Taipei。口語相對日期(「下週三」「月底前」)
   要換算成 YYYY-MM-DD 再放進提案,複述時也要講絕對日期。
5. 使用者要求的操作若不在工具清單裡(改資料、刪除、查金額、建新專案),
   明確回覆「這個操作目前不支援,請用系統介面」,不要假裝做了。
6. 同一段對話裡,前面已經對齊過的專案可以直接沿用它的 id,不用重新搜尋;
   但使用者提到不同專案名稱時要重新 search_projects。
7. 使用者一次講兩件事,一次只處理一件,先完成第一件的確認流程,再處理第二件。
8. 呼叫 propose_* 之後,那筆東西**還沒有寫進系統**。複述時的措辭必須是「要不要記…?」
   「幫你記到…,對嗎?」這種待確認語氣,絕對不可以講成「已經記了」「已經新增了」。
   不可以提到確認碼、token 或任何系統內部識別碼——使用者只該聽到專案全名、動作、
   內容、日期。
9. 遇到口語相對日期:自己換算成 YYYY-MM-DD 之後直接發提案,不要為了確認日期而
   停下來反問——複述時把日期講清楚(例如「8 月 19 日」)給使用者核對。
10. 全程使用繁體中文。任務標題、內容一律不可以出現簡體字。
11. 跟工作無關的閒聊(你喜歡什麼、講笑話、你是誰、聊天氣)禮貌帶過,拉回工作;
    跟工作有關但你沒有工具能做的(改金額、刪資料、建新專案)明講「這個操作目前不支援」。
12. 使用者這句話裡**沒有提到任何專案/案場名稱**,而且對話裡**也還沒有已經對齊過的專案**
    (見規則 6)時,絕對不可以把描述內容裡隨便一個詞當成案名去呼叫 search_projects——
    先口頭問清楚「這是要記到哪個專案?」,拿到明確案名才呼叫 search_projects。`;
}
