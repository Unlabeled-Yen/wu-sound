import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabase';
import { AgentConfigError } from '@/lib/voice-agent-tools';

/**
 * Lab 3b 語音辨識層。
 * 規格:voice-lab/lab3-voice-spec-v1.md §2(3b)
 *
 * 為什麼不用瀏覽器內建辨識(3a 走過的路,已證實不可行):
 * - Chrome 的辨識是外包給 Google 的雲端服務,不是原廠 Chrome 就直接 network error
 * - iOS Safari 根本沒有 SpeechRecognition
 * - 不吃熱詞表,「磐頂」「放樣」這種專有名詞必錯
 *
 * 改成瀏覽器只負責錄音(MediaRecorder,iPhone 也支援)、辨識在我們自己的後端做。
 * 端點走 OpenAI 相容格式,所以換 Groq / 其他相容供應商只要改環境變數,不用改程式。
 */

const DEFAULT_BASE = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini-transcribe';

export type SttResult =
  | { ok: true; text: string; model: string }
  | { ok: false; error_code: string; message_zh: string };

export interface SttClient {
  transcribe(audio: Blob, filename: string, prompt?: string): Promise<SttResult>;
  model: string;
}

export function createSttClient(): SttClient {
  const apiKey = process.env.VOICE_STT_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new AgentConfigError('語音辨識尚未設定(缺 OPENAI_API_KEY 或 VOICE_STT_API_KEY)');
  }
  const base = (process.env.VOICE_STT_BASE_URL ?? DEFAULT_BASE).replace(/\/+$/, '');
  const model = process.env.VOICE_STT_MODEL ?? DEFAULT_MODEL;

  return {
    model,
    async transcribe(audio, filename, prompt) {
      const form = new FormData();
      form.append('file', audio, filename);
      form.append('model', model);
      // zh 指定語言,避免短句被誤判成日文或英文
      form.append('language', 'zh');
      if (prompt) form.append('prompt', prompt);

      let res: Response;
      try {
        res = await fetch(`${base}/audio/transcriptions`, {
          method: 'POST',
          headers: { authorization: `Bearer ${apiKey}` },
          body: form,
          signal: AbortSignal.timeout(30_000),
        });
      } catch (e) {
        return {
          ok: false,
          error_code: 'STT_UNREACHABLE',
          message_zh: `辨識服務連不上:${e instanceof Error ? e.message : String(e)}`,
        };
      }

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        return {
          ok: false,
          error_code: `STT_HTTP_${res.status}`,
          message_zh: `辨識失敗(HTTP ${res.status}):${body.slice(0, 200)}`,
        };
      }

      const data = (await res.json()) as { text?: string };
      const text = (data.text ?? '').trim();
      if (!text) {
        // 空白轉寫不能當成「使用者沒講話所以沒事」——要讓上層明確回「沒聽清楚」(handoff §8)
        return { ok: false, error_code: 'STT_EMPTY', message_zh: '沒有辨識到內容,請再說一次' };
      }
      return { ok: true, text, model };
    },
  };
}

// ---------- 熱詞表 ----------

/**
 * 固定術語。這些是講的人天天在用、但辨識模型沒看過幾次的詞。
 * 專案名不寫死在這裡——那要從資料庫來(handoff §7:熱詞表由系統產生,不可手動維護)。
 */
const FIXED_TERMS = [
  '木作',
  '放樣',
  '監工',
  '進場',
  '收邊',
  '天花',
  '線槽',
  '音響定位',
  '喇叭',
  '擴大機',
  '混音器',
  '訊號線',
  '吊掛',
  '陣列',
  '調音',
  '驗收',
];

/** prompt 有長度限制(whisper 系列約 224 token),超過就截斷,並在回傳裡講明截了幾個 */
const MAX_PROMPT_CHARS = 400;

export interface HotwordPrompt {
  prompt: string;
  siteCount: number;
  truncated: boolean;
}

/**
 * 從 sites 表產生熱詞提示。
 * 專案名是最容易辨錯、也最不能錯的東西(記錯專案的資料比沒記更糟),
 * 所以案名排在術語前面,截斷時先犧牲術語。
 */
export async function buildHotwordPrompt(): Promise<HotwordPrompt> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from('sites').select('name').eq('active', true).order('name').limit(60);
  // 熱詞拿不到不該讓整個辨識失敗,但也不能靜默——回傳 siteCount=0 讓呼叫端能看見
  const names = error ? [] : ((data ?? []) as { name: string }[]).map((s) => s.name);

  const parts: string[] = [];
  let used = 0;
  let truncated = false;
  for (const word of [...names, ...FIXED_TERMS]) {
    if (used + word.length + 1 > MAX_PROMPT_CHARS) {
      truncated = true;
      break;
    }
    parts.push(word);
    used += word.length + 1;
  }

  return {
    prompt: `這是台灣音響工程公司的現場口述記錄,可能出現以下專有名詞:${parts.join('、')}。`,
    siteCount: names.length,
    truncated,
  };
}
