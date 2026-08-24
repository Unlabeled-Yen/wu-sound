import 'server-only';
import { todayInTaipei } from '@/lib/voice-agent';

/**
 * voice-lab Realtime 語音版的工具面。跟 lib/voice-agent-tools.ts(Lab 2 文字版)
 * 用同一組 Lab 1 端點跟同一套安全設計,只是把 Anthropic 的 input_schema 格式
 * 換成 OpenAI Realtime 的 function-calling 格式(parameters 不是 input_schema,
 * 且是攤平的 tools 陣列,不包一層 name/description)。
 *
 * 跟 Lab 2 一樣的關鍵防禦:工具清單裡沒有 create_task / log_note——模型只能
 * 呼叫 propose_create_task / propose_log_note,真正的寫入永遠是系統帶著
 * propose 拿到的 token 去做的,payload hash 對不上就寫不進去。
 *
 * 2026-08-24 Yen 定案:語音模式**拿掉口頭確認那一步**,propose 之後系統
 * 自己接著 commit(見 RealtimeVoiceClient.tsx)。兩階段 token 機制保留,
 * 只是「誰按確認」從使用者變成系統。模型依然沒有直接寫入的工具。
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
    name: 'list_projects',
    description:
      '列出全部進行中的專案(名稱+id),不需要關鍵字。使用者問「有哪些專案」「列出所有案子」這種沒有指定特定案名的問法時用這個,不要用 search_projects 硬塞一個猜測的關鍵字進去。',
    parameters: { type: 'object', properties: {} },
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
      '把使用者口述的事情記進系統(唯一的寫入工具)。不管使用者說「記一筆」「幫我記錄」「新增任務」還是「備註一下」,一律用這個。呼叫後系統會直接寫入,不需要再問使用者確認。',
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
];

/** LLM 工具名 → Lab 1 propose_write 的 action(跟 voice-agent-tools.ts 的 PROPOSE_ACTION 同一份對應) */
export const REALTIME_PROPOSE_ACTION: Record<string, 'create_task' | 'log_note'> = {
  propose_create_task: 'create_task',
  propose_log_note: 'log_note',
};

export const READ_TOOL_NAMES = new Set(['search_projects', 'list_projects', 'get_project_summary', 'list_tasks']);

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
3. 寫入只有 propose_create_task 一個工具,**一律記成任務**(2026-08-24 Yen 定案)。
   不管使用者講「記一筆」「幫我記錄」「新增任務」「備註一下」還是「今天到了哪裡」,
   全部用它,沒有第二種選擇。**不要再問使用者「要不要記」「對嗎」——講了就是要記,
   直接呼叫工具去寫**。資訊不足以填必填欄位時才開口問,問的是缺的那項資訊,
   不是問他要不要記。
   (背景:先前有工作記錄/任務兩種寫法,AI 判斷成工作記錄、使用者卻去任務看板找,
   以為沒寫進去——拿掉選擇就不會再錯配。)
3-1. **這條最重要——關於「記好了沒」你只能照工具回傳值講,不可以自己猜**:
   工具回 written: true → 才可以說已經記好了。
   工具回 written: false → 照實說寫入失敗,把 error_zh 的原因講給使用者聽。
   工具還沒回來 → 什麼都還沒發生,不可以說已經記好了。
   (2026-08-24 真機事故:AI 自己宣告記錄成功,實際上系統完全沒寫入,
   使用者信以為真——這是這個系統最不能發生的事。)
4. 今天是 ${todayInTaipei(now)},時區 Asia/Taipei。口語相對日期(「下週三」「月底前」)
   要換算成 YYYY-MM-DD 再放進提案,複述時也要講絕對日期。
5. 使用者要求的操作若不在工具清單裡(改資料、刪除、查金額、建新專案),
   明確回覆「這個操作目前不支援,請用系統介面」,不要假裝做了。
6. 同一段對話裡,前面已經對齊過的專案可以直接沿用它的 id,不用重新搜尋;
   但使用者提到不同專案名稱時要重新 search_projects。
7. 使用者一次講兩件事,一次只處理一件,先完成第一件的確認流程,再處理第二件。
8. 工具回報寫入成功之後,用一句話告訴使用者記了什麼(專案全名+內容重點),
   讓他有機會聽出錯誤自己去系統改。不可以提到確認碼、token 或任何系統內部
   識別碼——使用者只該聽到專案全名、動作、內容、日期。
9. 遇到口語相對日期:自己換算成 YYYY-MM-DD 之後直接發提案,不要為了確認日期而
   停下來反問——複述時把日期講清楚(例如「8 月 19 日」)給使用者核對。
10. 全程使用繁體中文。任務標題、內容一律不可以出現簡體字。
11. 跟工作無關的閒聊(你喜歡什麼、講笑話、你是誰、聊天氣)禮貌帶過,拉回工作;
    跟工作有關但你沒有工具能做的(改金額、刪資料、建新專案)明講「這個操作目前不支援」。
12. 使用者這句話裡**沒有提到任何專案/案場名稱**,而且對話裡**也還沒有已經對齊過的專案**
    (見規則 6)時,絕對不可以把描述內容裡隨便一個詞當成案名去呼叫 search_projects——
    先口頭問清楚「這是要記到哪個專案?」,拿到明確案名才呼叫 search_projects。
13. 使用者問「有哪些專案」「列出所有案子」這種**沒有指定特定案名**的問法時,
    呼叫 list_projects,不要呼叫 search_projects(那個一定要關鍵字,硬塞會查不到)。`;
}
