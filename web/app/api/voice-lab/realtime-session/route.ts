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
// 開啟輸入端轉錄:UI 要把「你剛剛講了什麼」顯示在畫面上給使用者核對
// (RealtimeVoiceClient 的 lastCaption)。不開的話
// conversation.item.input_audio_transcription.completed 事件不會來,畫面就沒東西可顯示。
// (原本還兼任確認/取消的關鍵字比對來源,2026-08-24 拿掉口頭確認後只剩顯示用途。)
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
              // 斷句改用語意判斷(2026-08-24 定案)。
              //
              // 原本是 server_vad:純粹量「靜音持續多久」來判斷你講完沒。那個做法
              // 有個解不開的矛盾——調長才不會在你停頓想措辭時把你切掉,但調長就
              // 一定慢;調短反應快,但你一停頓就被搶話。前兩輪調參
              // (threshold 0.5→0.75→0.82、silence 500→900→1300ms)其實只是在
              // 這條矛盾線上來回移動,治不了根。
              //
              // semantic_vad 是拿語意分類器判斷「這句話講完了沒」,不是量靜音,
              // 所以能同時做到「不切你」跟「講完馬上接」——跳出上面那個矛盾。
              // 副作用是背景噪音也比較不會被誤判成人聲(工地現場的重點)。
              //
              // eagerness 是唯一的旋鈕:auto(=medium)→ 覺得慢改 high,
              // 覺得會搶話改 low。不要再回去手調 threshold/靜音毫秒數。
              turn_detection: {
                type: 'semantic_vad',
                eagerness: process.env.VOICE_REALTIME_EAGERNESS ?? 'auto',
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
