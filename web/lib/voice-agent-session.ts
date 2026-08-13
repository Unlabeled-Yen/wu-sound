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

export function dropSession(id: string): void {
  SESSIONS.delete(id);
}

/** 測試用:清空全域狀態 */
export function resetSessionsForTest(): void {
  SESSIONS.clear();
}
