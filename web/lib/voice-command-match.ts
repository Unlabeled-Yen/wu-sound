import * as OpenCC from 'opencc-js';

/**
 * 語音確認/取消的關鍵字比對——純函式,故意不標 server-only。
 * 原本活在 voice-agent.ts(server-only,含 Anthropic SDK),但 Realtime 語音版
 * (app/voice-lab-realtime/RealtimeClient.tsx)需要在瀏覽器端對使用者語音轉出的
 * 文字做同一套比對,不能 import 一個 server-only 模組。抽出來當唯一事實來源,
 * voice-agent.ts 改成從這裡 re-export,兩邊(Lab 2 文字版、Realtime 語音版)
 * 永遠用同一份詞表,不會各自維護出兩份不一致的確認詞。
 *
 * 「不解讀自由文字語意、只比對關鍵字」是這整個系統的安全閥(見 voice-agent.ts
 * 檔頭鐵律)——這裡的比對必須是精確字串比對,不能改成「包含關鍵字就算數」,
 * 否則一句提到「絕對不對」的話會被誤判成確認。
 */

const toTw = OpenCC.Converter({ from: 'cn', to: 'tw' });

export function toTraditional(value: string): string {
  return toTw(value);
}

/**
 * 免手情境下的確認判斷(語音沒有按鈕,但要守的鐵律不是「必須是按鈕」,而是
 * **確認與否不由 LLM 判斷**——按鈕只是這條鐵律在螢幕上的實作,這裡用白名單
 * 字串比對代替按鈕:判斷的是這個函式,不是模型)。
 *
 * 比對規則刻意嚴格,但「嚴格」指的是**精確詞比對、不做語意推論**,不是
 * **只認得一字不差的單詞**——2026-08-24 全語音對答真機實測發現,原本要求
 * 整句一字不差等於白名單詞太脆:自然講話常是「嗯,對,確認一下」「好啊可以」
 * 這種帶語氣詞/連續肯定詞的完整句子,STT 轉出來的文字幾乎不可能剛好等於單一
 * 詞,永遠落到 unclear、卡住不動——不是安全閥生效,是安全閥擋到了正常對話。
 *
 * 改法:先剝掉開頭常見語氣詞(嗯/啊/好啊/是啊…),再用標點斷句,**逐句**做
 * 精確比對——「不對」「不可以」是完整一句/一詞,不會被拆成「不」+「對」,
 * 所以不會被誤判成確認;但「嗯,對,確認一下」拆開後有一句精確等於「對」,
 * 就能通過。仍然不是「句子裡出現關鍵字就算數」的包含比對,是斷句後的精確比對。
 *
 * - 兩種詞都出現(矛盾句,例如「對,不對」)一律 unclear,不猜——寧可再問一次
 * - 不在名單上的一律 unclear,包含「嗯」「應該吧」「大概」——模糊回應視為未確認
 */
const CONFIRM_WORDS = new Set(['確認', '確定', '對', '對的', '沒錯', '可以', '沒問題', '就這樣', '是的', '好的', '好啊', '好']);
const CANCEL_WORDS = new Set(['取消', '不對', '不是', '不要', '算了', '不用', '錯了', '重來']);

/**
 * 開頭常見語氣詞——只當斷句用的雜訊剝掉,不當成語意的一部分。
 * 只能放「本身不帶語意、單獨出現也不成立確認」的純語氣詞——「好啊」「是啊」
 * 本身就是完整的肯定用語,不能放進來剝,不然使用者只講「好啊」兩個字時
 * 會被整句剝空,永遠比對不到,反而更嚴重(2026-08-24 寫的時候差點自己踩到)。
 */
const LEADING_FILLER_RE = /^(嗯|啊|欸|誒|齁|喔|哦|那)+/u;
const TRAILING_PARTICLE_RE = /[啊阿喔哦囉啦呢嘛耶欸]+$/u;
const CLAUSE_SPLIT_RE = /[\s,。,.!!??、~～]+/u;

export function matchVoiceCommand(transcript: string): 'confirm' | 'cancel' | 'unclear' {
  const normalized = toTraditional(transcript).replace(LEADING_FILLER_RE, '');
  const clauses = normalized
    .split(CLAUSE_SPLIT_RE)
    .map((c) => c.replace(TRAILING_PARTICLE_RE, ''))
    .filter(Boolean);
  if (clauses.length === 0) return 'unclear';

  const hasConfirm = clauses.some((c) => CONFIRM_WORDS.has(c));
  const hasCancel = clauses.some((c) => CANCEL_WORDS.has(c));
  if (hasConfirm && hasCancel) return 'unclear'; // 矛盾句,不猜
  if (hasConfirm) return 'confirm';
  if (hasCancel) return 'cancel';
  return 'unclear';
}
