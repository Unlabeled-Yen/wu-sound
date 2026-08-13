import 'server-only';
import type { LlmMessage } from '@/lib/voice-agent-tools';

/**
 * voice-lab Lab 2 對話 session 儲存。
 *
 * Phase 1 刻意用**記憶體 Map**,不建 DB 表(spec §6,Yen 已確認):
 * 這是驗證對話品質的實驗性 UI,重啟即清空可接受。
 * 這是刻意的簡化,不是疏漏——若之後要正式上線給員工用,這一層要換成持久化。
 *
 * 副作用:Next.js dev 熱重載或多台 serverless instance 下 session 會不連續。
 * 找不到 session 時我們**建新的**(而不是報錯),但呼叫端拿得到 `created` 旗標,
 * 可以據此告訴使用者「對話已重置」,不讓它靜默失憶。
 */

export interface PendingField {
  label: string;
  value: string;
}

export interface PendingWrite {
  action: 'create_task' | 'log_note';
  /** propose_write 回傳的 canonical_echo——commit 時要原封不動送回去,不然 payload hash 對不起來 */
  payload: Record<string, unknown>;
  token: string;
  /** 給 UI 直接顯示的結構化欄位(不經 LLM 轉述,標籤不會說謊) */
  fields: PendingField[];
  proposedAt: number;
}

export interface AgentSession {
  id: string;
  messages: LlmMessage[];
  pending: PendingWrite | null;
  /** search_projects / 提案過程中看過的 id → 名稱,複述與結果卡片用 */
  projectNames: Record<string, string>;
  updatedAt: number;
}

const SESSIONS = new Map<string, AgentSession>();

/** 超過這個時間沒動作的 session 直接丟掉,避免長時間執行的 process 記憶體無限長 */
const SESSION_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_SESSIONS = 200;

function sweep(now: number): void {
  for (const [id, s] of SESSIONS) {
    if (now - s.updatedAt > SESSION_TTL_MS) SESSIONS.delete(id);
  }
  while (SESSIONS.size > MAX_SESSIONS) {
    const oldest = [...SESSIONS.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt)[0];
    if (!oldest) break;
    SESSIONS.delete(oldest[0]);
  }
}

export function getOrCreateSession(id: string, now = Date.now()): { session: AgentSession; created: boolean } {
  sweep(now);
  const existing = SESSIONS.get(id);
  if (existing) {
    existing.updatedAt = now;
    return { session: existing, created: false };
  }
  const session: AgentSession = {
    id,
    messages: [],
    pending: null,
    projectNames: {},
    updatedAt: now,
  };
  SESSIONS.set(id, session);
  return { session, created: true };
}

export function touchSession(session: AgentSession, now = Date.now()): void {
  session.updatedAt = now;
}

/** 保留的訊息則數上限。一輪對話最多會產生約 10 則(工具呼叫來回),所以這大約是最近 6-8 輪 */
const MAX_MESSAGES = 60;

/**
 * 修剪過長的對話歷史。
 *
 * 不修剪的話,訊息陣列會無限成長,直到某一次呼叫撞上模型的 context 上限——
 * 而那一刻一定發生在使用者正在用的時候,不是在測試的時候。
 *
 * 切割點的限制:tool_result 必須跟在發出該呼叫的 assistant 訊息之後,
 * 直接從中間砍會留下沒有主人的 tool_result,模型端會直接報錯。
 * 所以只在「純文字的 user 訊息」這種乾淨的邊界切。切不到就不切,寧可留長一點。
 */
export function trimMessages(messages: LlmMessage[], max = MAX_MESSAGES): LlmMessage[] {
  if (messages.length <= max) return messages;

  for (let i = messages.length - max; i < messages.length; i += 1) {
    const m = messages[i];
    const isPlainUserText = m.role === 'user' && m.content.every((b) => b.type === 'text');
    if (isPlainUserText) return messages.slice(i);
  }
  return messages;
}

export function dropSession(id: string): void {
  SESSIONS.delete(id);
}

/**
 * 同一個 session 一次只跑一輪。
 *
 * 兩個請求同時進來(連點送出、兩個分頁用同一個 session_id)會交錯推訊息,
 * 產生「沒有對應 tool_use 的 tool_result」——模型端收到會直接 400,
 * 而且對話歷史從此壞掉,使用者只會看到「怎麼一直失敗」。
 * 用一條 promise 鏈把同 session 的請求排隊,不同 session 互不影響。
 */
const LOCKS = new Map<string, Promise<unknown>>();

export function withSessionLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const prev = LOCKS.get(id) ?? Promise.resolve();
  // 前一輪成功或失敗都要接著跑,不然一次錯誤會把這個 session 永遠卡住
  const run = prev.then(fn, fn);
  const tail = run.catch(() => undefined);
  LOCKS.set(id, tail);
  void tail.then(() => {
    // 自己還是鏈尾時才清掉,不要把後面排隊的人一起丟掉
    if (LOCKS.get(id) === tail) LOCKS.delete(id);
  });
  return run;
}

/** 測試用:清空全域狀態 */
export function resetSessionsForTest(): void {
  SESSIONS.clear();
}
