import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { AgentConfigError } from '@/lib/voice-agent-tools';
import { buildHotwordPrompt, createSttClient } from '@/lib/voice-stt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Lab 3b 語音辨識端點:瀏覽器把錄好的音檔傳上來,這裡呼叫辨識服務轉成文字。
 *
 * 這一支只做「聲音 → 文字」,不碰對話狀態——轉出來的文字由前端再送去
 * /api/voice-lab/chat,跟打字走完全同一條路。這樣語音永遠不會有一條
 * 繞過確認機制的捷徑(handoff §5:任何繞過確認的捷徑都是架構違規)。
 */

/** 錄音長度上限對應的檔案大小。太大的檔案要擋在打到辨識服務之前,不然是花錢買一個必定失敗 */
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * 音檔大小下限。實測值:macOS 語音合成講「嗯」約 5.5KB、講「幫我」約 6.5KB,
 * 都短到會誘發模型編造。一句最短的有效指令(「磐頂記一筆」)約 15KB 起跳,
 * 取 10KB 當門檻——擋掉單字級的雜訊,不誤傷真的短句。
 */
const MIN_BYTES = 10 * 1024;

export async function POST(req: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 });

  let stt: ReturnType<typeof createSttClient>;
  try {
    stt = createSttClient();
  } catch (e) {
    if (e instanceof AgentConfigError) {
      return NextResponse.json({ error: e.message, error_code: 'SERVICE_UNAVAILABLE' }, { status: 503 });
    }
    throw e;
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: '請求格式不對(需要 multipart/form-data)' }, { status: 400 });
  }

  const file = form.get('audio');
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: '沒有收到音檔' }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: '音檔是空的,可能沒有錄到聲音' }, { status: 400 });
  }
  /**
   * 太小的音檔直接擋掉,不要送去辨識。
   *
   * 這不是省錢,是防止系統說謊:實測 gpt-4o-transcribe 拿到過短音檔時**會編造內容**,
   * 而且會從我們給的熱詞提示裡撈詞——送一段只有「嗯」的 5.5KB 音檔,
   * 它回「木。」「喇叭」(音檔裡沒這些字)。前端已有一道 speechMs 防線,
   * 這裡再擋一次:前端防線繞得過(直接打 API),這道繞不過。
   */
  if (file.size < MIN_BYTES) {
    return NextResponse.json(
      { error: '錄到的聲音太短,請再說一次', error_code: 'AUDIO_TOO_SHORT' },
      { status: 422 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `錄音太長(${Math.round(file.size / 1024 / 1024)}MB),請分段講` },
      { status: 413 },
    );
  }

  const filename = typeof form.get('filename') === 'string' ? String(form.get('filename')) : 'audio.webm';
  const hotwords = await buildHotwordPrompt();
  const result = await stt.transcribe(file, filename, hotwords.prompt);

  if (!result.ok) {
    // 辨識失敗一律講清楚,不回一個空字串讓前端以為使用者沒講話
    return NextResponse.json(
      { error: result.message_zh, error_code: result.error_code },
      { status: result.error_code === 'STT_EMPTY' ? 422 : 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    text: result.text,
    model: result.model,
    // 重試過幾次要看得見:持續 >1 代表辨識服務端還不穩,不該讓它靜靜地慢下去
    attempts: result.attempts,
    // 熱詞狀態要看得見:0 筆代表熱詞沒生效(可能 DB 讀失敗),辨錯專有名詞時才知道往哪查
    hotwords: { site_count: hotwords.siteCount, truncated: hotwords.truncated },
  });
}
