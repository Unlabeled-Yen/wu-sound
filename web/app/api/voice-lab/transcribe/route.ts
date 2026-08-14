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
 * 音檔大小下限。
 *
 * 訂這個值踩過一次坑(Yen 2026-08-14):原本用 macOS 語音合成的 AAC 檔推算,
 * 取 10KB,結果真人用瀏覽器錄音(Opus 編碼)被誤擋,變成講什麼都說聽不到。
 * 不同編碼的位元率差很多——Opus 語音約 6-8KB/秒,AAC 合成音檔則高得多。
 *
 * 現在取 4KB:大約是 Opus 半秒的量,足以擋掉單字級雜訊
 * (實測會誘發模型編造的檔案是 5.5KB AAC ≈ 0.5 秒),
 * 又不會誤殺真人講的短句。寧可讓邊緣案例通過,也不要讓使用者講不進去——
 * 編造內容有前端與這裡兩道防線,誤擋卻會讓整個功能不能用。
 */
const MIN_BYTES = 4 * 1024;

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
      // 聽不清楚(空白、回吐提示詞)是「請使用者重講」,不是伺服器故障,用 422;
      // 其餘(連不上、HTTP 錯誤)才是 502
      { status: result.error_code === 'STT_EMPTY' || result.error_code === 'STT_PROMPT_ECHO' ? 422 : 502 },
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
