import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { REALTIME_TOOLS, buildRealtimeInstructions } from '@/lib/voice-realtime-tools';

export const runtime = 'nodejs';

// 伺服器拿真正的 OPENAI_API_KEY 跟 OpenAI 換一組短時效的 client secret,瀏覽器
// 只會拿到這個短時效憑證去開 WebRTC——真正的 key 永遠不會進到前端程式碼。
// 端點/欄位跟著 OpenAI Realtime API 走,同一套「環境變數可覆蓋」的慣例見
// lib/voice-stt.ts(換供應商/換模型不用改程式)。
const DEFAULT_BASE = 'https://api.openai.com/v1';
// 2026-08-24 直接跟 /v1/models 對這把 key 查了實際可用的 realtime model,
// 這帳號只開通了 `gpt-realtime-2.1-mini` 一個(原先我以為 `gpt-realtime-2.1`
// 是憑印象亂寫,其實 2.1 系列確實存在,只是 mini 變體才對這帳號放行)。
// 之後帳號升級到完整版可改回 `gpt-realtime-2.1` 或 `gpt-realtime`,
// 或設 VOICE_REALTIME_MODEL 環境變數覆蓋,不用改程式。
const DEFAULT_MODEL = 'gpt-realtime-2.1-mini';
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
              // 打斷/接手判斷放寬(2026-08-24 Yen 真機兩輪調參後定在這裡):
              // - threshold 0.5(預設)→0.75→0.82,需要更明顯的人聲才會判定
              //   為打斷,雜音/近距離呼吸不會誤觸
              // - silence_duration 500(預設)→900→1300ms,AI 講到句中停頓
              //   不會馬上被使用者的一個「嗯」接走
              // 再想更放寬:threshold 拉到 0.88,silence_duration 拉到 1600
              // (超過這個範圍會開始感覺 AI 聽不到你插話,反效果)
              turn_detection: {
                type: 'server_vad',
                threshold: 0.82,
                prefix_padding_ms: 300,
                silence_duration_ms: 1300,
              },
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
