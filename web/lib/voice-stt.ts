import 'server-only';
import * as OpenCC from 'opencc-js';
import { getSupabaseAdmin } from '@/lib/supabase';
import { AgentConfigError } from '@/lib/voice-agent-tools';

/**
 * 辨識結果的簡→繁轉換。
 * 實測:同一段音檔,提示詞沒講「請用繁體」時整句回簡體
 * (「方我在盘顶长老教会记一笔,木座进场前先放样」)。
 * 提示詞講了就會回繁體,但那是模型的自願行為——這裡再轉一次當保險,
 * 跟 agent 那邊處理模型產生簡體字是同一個道理。
 */
const toTw = OpenCC.Converter({ from: 'cn', to: 'tw' });

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
const DEFAULT_MODEL = 'gpt-4o-transcribe';

export type SttResult =
  | { ok: true; text: string; model: string; attempts: number }
  | { ok: false; error_code: string; message_zh: string; attempts: number };

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
      const send = async () => {
        // FormData 不能重複使用,每次重試都要重建
        const form = new FormData();
        form.append('file', audio, filename);
        form.append('model', model);
        // zh 指定語言,避免短句被誤判成日文或英文
        form.append('language', 'zh');
        if (prompt) form.append('prompt', prompt);
        return fetch(`${base}/audio/transcriptions`, {
          method: 'POST',
          headers: { authorization: `Bearer ${apiKey}` },
          body: form,
          signal: AbortSignal.timeout(30_000),
        });
      };

      let res: Response;
      let attempts = 0;
      try {
        /**
         * 重試的理由(實測數據,不是預防性寫法):剛調整過 project 模型白名單之後,
         * 同一個音檔連打 8 次會有 3 次回 403「沒有存取權」、5 次成功——
         * OpenAI 端的權限傳播不是即時一致的,而且失敗是隨機的。
         *
         * 單次失敗率約 37%,重試到三次可壓到約 5%。現場員工按了麥克風卻隨機失敗、
         * 還要整段重錄,是不能接受的體驗。
         *
         * 這不是把錯誤吞掉:真的沒權限時三次都會失敗、照樣回報,
         * 而且重試過幾次會回傳給呼叫端(attempts),持續需要重試代表對方還沒穩,
         * 那是要被看見的資訊。
         * 400(檔案格式錯)、401(key 錯)、413(檔案太大)不重試——那些重試一百次也一樣。
         */
        const MAX_ATTEMPTS = 3;
        for (;;) {
          attempts += 1;
          res = await send();
          const retriable = !res.ok && res.status !== 400 && res.status !== 401 && res.status !== 413;
          if (!retriable || attempts >= MAX_ATTEMPTS) break;
          await new Promise((r) => setTimeout(r, 700 * attempts));
        }
      } catch (e) {
        return {
          ok: false,
          error_code: 'STT_UNREACHABLE',
          message_zh: `辨識服務連不上:${e instanceof Error ? e.message : String(e)}`,
          attempts,
        };
      }

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        return {
          ok: false,
          error_code: `STT_HTTP_${res.status}`,
          message_zh: `辨識失敗(HTTP ${res.status}):${body.slice(0, 200)}`,
          attempts,
        };
      }

      const data = (await res.json()) as { text?: string };
      const text = toTw((data.text ?? '').trim());
      if (!text) {
        // 空白轉寫不能當成「使用者沒講話所以沒事」——要讓上層明確回「沒聽清楚」(handoff §8)
        return { ok: false, error_code: 'STT_EMPTY', message_zh: '沒有辨識到內容,請再說一次', attempts };
      }
      if (prompt && looksLikePromptEcho(text, prompt)) {
        return {
          ok: false,
          error_code: 'STT_PROMPT_ECHO',
          message_zh: '沒聽清楚,請再說一次',
          attempts,
        };
      }
      return { ok: true, text, model, attempts };
    },
  };
}

/**
 * 判斷轉寫結果是不是模型在「回吐提示詞」而不是真的聽到內容。
 *
 * 實測的失敗樣態(Yen 2026-08-14 回報,已重現):音檔太短或聽不清時,
 * gpt-4o-transcribe 會編造內容,而且明顯是從熱詞提示裡撈詞:
 * - 只有「嗯」的音檔 → 回「木。」「喇叭」「混。」(都是提示詞裡的字)
 * - 使用者實際講了一整句 → 畫面顯示「這個現場工程進度幾乎要到一個段落」,
 *   正是從提示詞開頭「台灣音響工程公司的現場口述記錄」拼出來的
 *
 * 特徵很明確:**很短,而且用到的字全部出現在提示詞裡**。
 * 只擋這種情況——長句就算用到熱詞也放行(那本來就是熱詞的用途),
 * 「確認」「取消」這種短口令不在提示詞裡,也不會被誤擋。
 *
 * 擋掉之後回「沒聽清楚,請再說一次」,不是把編造的句子交給使用者。
 * 寧可請他重講,也不要讓他看到一句自己沒講過的話被當成他講的。
 */
const ECHO_MAX_CHARS = 6;

export function looksLikePromptEcho(text: string, prompt: string): boolean {
  const stripped = text.replace(/[\s,。,.!!??、~～:：「」()()]/g, '');
  if (!stripped || stripped.length > ECHO_MAX_CHARS) return false;
  // 逐字檢查:每個字都在提示詞裡出現過,才算是回吐
  return [...stripped].every((ch) => prompt.includes(ch));
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
    /**
     * **只給詞彙表,絕對不要寫敘述句。**
     *
     * 這是實測踩出來的(Yen 2026-08-14 回報「他完全沒聽對我說的話」):
     * 原本的提示開頭寫「這是台灣音響工程公司的現場口述記錄,請用繁體中文轉寫」,
     * 結果那句敘述變成模型的**內容範本**——音訊聽不清時它照著範本編一句像樣的工地記錄:
     *
     *   完全無聲的音檔 + 敘述句提示 → 「這個是 THE HOPE Taipei 的音響工程。」
     *   完全無聲的音檔 + 只給詞彙表 → 「木作」
     *   完全無聲的音檔 + 完全沒提示 → 「Sınıfın」
     *
     * 而清楚的音檔在三種寫法下辨識結果一樣好(都正確辨出「磐頂長老教會」),
     * 沒提示才會錯成「壇頂」。也就是說:**詞彙表有用,敘述句只有害。**
     *
     * 差別在失敗的樣子:敘述句會讓失敗長得像真的工作記錄(使用者不會發現,
     * 假資料就這樣進系統);只給詞彙表則會吐出零散單詞,一看就知道不對,
     * 而且會被 looksLikePromptEcho 接住擋掉。
     *
     * 繁體不用特別交代——詞彙表本身就是繁體,已經足夠引導,
     * 而且辨識結果還會再過一次 toTw() 保險。
     */
    prompt: parts.join('、'),
    siteCount: names.length,
    truncated,
  };
}
