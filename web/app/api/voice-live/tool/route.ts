import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { AgentConfigError } from '@/lib/voice-agent-tools';
import {
  runRealtimeStructuredCommand,
  runRealtimeTool,
  runRealtimeVoiceCommand,
} from '@/lib/voice-realtime';
import { withSessionLock } from '@/lib/voice-agent-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Lab 3c 工具轉發端點(spec §3):
 * 模型發 function_call → 瀏覽器收到 → 打這裡 → 後端驗證+轉發 Lab 1 → 結果回填對話。
 * 前端只是傳話筒,不碰 VOICE_API_KEY、不做任何判斷。
 *
 * action:
 *   tool          → 執行一次模型的工具呼叫(propose_* 只產生提案,不寫入)
 *   voice_command → 使用者逐字稿走伺服器端白名單比對,比對到「確認」才 commit
 *   confirm/cancel→ 螢幕按鈕的結構化事件(雙軌的另一軌)
 */

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
  // 同 chat route 的慣例:使用者 id 併進 session key,不跨帳號共用
  const sessionKey = `${user.id}:${sessionId}`;
  const origin = new URL(req.url).origin;

  const action = body.action;

  try {
    // 同一通電話的請求排隊跑——工具呼叫與確認口令交錯會弄壞 pending 狀態
    return await withSessionLock(sessionKey, async () => {
      if (action === 'tool') {
        const name = typeof body.name === 'string' ? body.name : '';
        if (!name) return bad('缺少工具名稱 name', 400);
        const args = body.args && typeof body.args === 'object' ? (body.args as Record<string, unknown>) : {};
        const result = await runRealtimeTool(sessionKey, name, args, origin);
        return NextResponse.json({ ok: true, ...result });
      }

      if (action === 'voice_command') {
        const transcript = typeof body.transcript === 'string' ? body.transcript.trim() : '';
        if (!transcript) return bad('沒有辨識到任何語音內容', 400);
        const result = await runRealtimeVoiceCommand(sessionKey, transcript, origin);
        return NextResponse.json({ ok: true, ...result });
      }

      if (action === 'confirm' || action === 'cancel') {
        const result = await runRealtimeStructuredCommand(sessionKey, action, origin);
        return NextResponse.json({ ok: true, ...result });
      }

      return bad(`未知的 action: ${String(action)}`, 400);
    });
  } catch (e) {
    if (e instanceof AgentConfigError) {
      return NextResponse.json({ error: e.message, error_code: 'SERVICE_UNAVAILABLE' }, { status: 503 });
    }
    // 工具轉發炸了就明講,不回一句假裝正常的話
    return NextResponse.json(
      { error: `工具執行失敗: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }
}
