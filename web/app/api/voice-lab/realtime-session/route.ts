import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { REALTIME_TOOLS, buildRealtimeInstructions } from '@/lib/voice-realtime-tools';

export const runtime = 'nodejs';

// 伺服器拿真正的 OPENAI_API_KEY 跟 OpenAI 換一組短時效的 client secret,瀏覽器
// 只會拿到這個短時效憑證去開 WebRTC——真正的 key 永遠不會進到前端程式碼。
// 端點/欄位跟著 OpenAI Realtime API 走,同一套「環境變數可覆蓋」的慣例見
// lib/voice-stt.ts(換供應商/換模型不用改程式)。
const DEFAULT_BASE = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-realtime-2.1';
const DEFAULT_VOICE = 'marin';
// 使用者語音轉出的文字要拿來做關鍵字比對(確認/取消),所以一定要開啟輸入端轉錄——
// 不開的話 conversation.item.input_audio_transcription.completed 事件根本不會來,
// 「不解讀自由文字語意、只比對關鍵字」這道防呆閥就沒有輸入可比對。
const DEFAULT_TRANSCRIBE_MODEL = 'gpt-4o-transcribe';

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });

  const apiKey = process.env.VOICE_REALTIME_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: '語音即時通話尚未設定(缺 OPENAI_API_KEY 或 VOICE_REALTIME_API_KEY)' }, { status: 503 });
  }
  const base = (process.env.VOICE_REALTIME_BASE_URL ?? DEFAULT_BASE).replace(/\/+$/, '');
  const model = process.env.VOICE_REALTIME_MODEL ?? DEFAULT_MODEL;
  const voice = process.env.VOICE_REALTIME_VOICE ?? DEFAULT_VOICE;

  let res: Response;
  try {
    res = await fetch(`${base}/realtime/client_secrets`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session: {
          type: 'realtime',
          model,
          audio: {
            input: {
              transcription: { model: process.env.VOICE_REALTIME_TRANSCRIBE_MODEL ?? DEFAULT_TRANSCRIBE_MODEL },
            },
            output: { voice },
          },
          instructions: buildRealtimeInstructions(Date.now()),
          tools: REALTIME_TOOLS,
          tool_choice: 'auto',
        },
      }),
    });
  } catch (e) {
    return NextResponse.json(
      { error: `連不上 OpenAI Realtime: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    );
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message = body && typeof body === 'object' && 'error' in body
      ? JSON.stringify((body as { error: unknown }).error)
      : `HTTP ${res.status}`;
    return NextResponse.json({ error: `OpenAI Realtime 拒絕請求: ${message}` }, { status: 502 });
  }

  return NextResponse.json(body);
}
