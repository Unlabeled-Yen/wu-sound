import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import {
  AgentConfigError,
  cancelPending,
  confirmPending,
  createLlmClient,
  handleVoiceCommand,
  resolveContext,
  runAgentTurn,
  type AgentDeps,
  type AgentTurnResult,
} from '@/lib/voice-agent';
import { getOrCreateSession, withSessionLock } from '@/lib/voice-agent-session';
import { createHttpToolClient } from '@/lib/voice-agent-tools';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * voice-lab Lab 2 對話端點(spec §6)。
 *
 * 認證是兩層(spec §5):
 * - 這一層用登入 session(老闆/員工看得到的內部頁面)
 * - agent 後端打 Lab 1 工具端點時才用 VOICE_API_KEY(server-to-server)
 *
 * action 是**結構化欄位**,不是從文字猜的:
 *   message → 跑一輪 agent 迴圈
 *   confirm → 使用者按下 [確認],伺服器端直接寫入(LLM 不參與這個判斷)
 *   cancel  → 提案作廢
 */

type Action = 'message' | 'confirm' | 'cancel' | 'voice_command';

function bad(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: Request) {
  const user = await getSession();
  if (!user) return bad('未登入', 401);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return bad('請求格式不是有效的 JSON', 400);
  }

  const sessionId = typeof body.session_id === 'string' ? body.session_id.trim() : '';
  if (!sessionId) return bad('缺少 session_id', 400);
  const action: Action =
    body.action === 'confirm' || body.action === 'cancel' || body.action === 'voice_command'
      ? body.action
      : 'message';

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (action === 'message' && !message) return bad('訊息是空的', 400);
  if (action === 'voice_command' && !message) return bad('沒有辨識到任何語音內容', 400);

  // 情境是使用者從哪個 ERP 頁面 ⌘K 跳過來(Lab 4 §3)。查不到就退回 default,
  // 不是必填欄位——舊的前端沒帶這個欄位一樣能跑,只是拿不到情境專用工具。
  const context = resolveContext(typeof body.return_path === 'string' ? body.return_path : undefined);

  // 缺配置一律 loud 503,不靜默降級成「AI 剛好答不出來」
  let deps: AgentDeps;
  let provider: 'anthropic' | 'openai' | 'kimi';
  try {
    const picked = createLlmClient();
    provider = picked.provider;
    deps = { llm: picked.llm, tools: createHttpToolClient(new URL(req.url).origin) };
  } catch (e) {
    if (e instanceof AgentConfigError) {
      return NextResponse.json({ error: e.message, error_code: 'SERVICE_UNAVAILABLE' }, { status: 503 });
    }
    throw e;
  }

  // 使用者 id 併進 session key:同一個瀏覽器分頁 id 不會跨帳號共用對話
  const sessionKey = `${user.id}:${sessionId}`;
  const { session, created } = getOrCreateSession(sessionKey);

  let result: AgentTurnResult;
  try {
    // 同一個 session 的請求排隊跑:併發會讓訊息交錯,產生沒有主人的 tool_result
    result = await withSessionLock(sessionKey, async () => {
      if (action === 'confirm') return confirmPending(session, deps);
      if (action === 'cancel') return cancelPending(session);
      // 語音口令:白名單比對在 runtime 做,不讓 LLM 判斷使用者是否同意(Lab 3 §1)
      if (action === 'voice_command') return handleVoiceCommand(session, message, deps);
      return runAgentTurn(session, message, deps, context);
    });
  } catch (e) {
    if (e instanceof AgentConfigError) {
      return NextResponse.json({ error: e.message, error_code: 'SERVICE_UNAVAILABLE' }, { status: 503 });
    }
    // 對話跑爆了就明講,不回一句假裝正常的話
    return NextResponse.json(
      { error: `對話處理失敗: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    reply: result.reply,
    state: result.state,
    // 現在是誰在講話——驗證對話品質時,換供應商的差異要看得見,不能猜
    provider,
    // 這一輪用的是哪個情境的工具子集——驗證「情境有沒有正確切換」時要看得見,不能猜
    context,
    ...(result.options ? { options: result.options } : {}),
    ...(result.pending ? { pending: result.pending } : {}),
    ...(result.warning ? { warning: result.warning } : {}),
    tool_trace: result.toolTrace,
    // 記憶體 session 被重啟或掃除清掉時,讓 UI 有機會告訴使用者「對話已重置」,
    // 而不是靜默失憶後莫名其妙聽不懂上一句在講什麼(spec §6 的已知簡化)
    ...(created && action !== 'message' ? { session_reset: true } : {}),
    ...(created && action === 'message' ? { session_started: true } : {}),
  });
}
