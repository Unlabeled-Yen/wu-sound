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
 * 比對規則刻意嚴格:
 * - **整句相等**才算,不做包含比對——「不對」包含「對」、「不可以」包含「可以」,
 *   用包含比對會把否定聽成同意,那是會寫錯資料的錯法
 * - 只剝除語尾助詞(啊/喔/啦/呢/嘛),不做任何語意推論
 * - 不在名單上的一律 unclear,包含「嗯」「應該吧」「大概」——模糊回應視為未確認
 */
const CONFIRM_WORDS = new Set(['確認', '確定', '對', '對的', '沒錯', '可以', '沒問題', '就這樣', '是的', '好的']);
const CANCEL_WORDS = new Set(['取消', '不對', '不是', '不要', '算了', '不用', '錯了', '重來']);

export function matchVoiceCommand(transcript: string): 'confirm' | 'cancel' | 'unclear' {
  const cleaned = toTraditional(transcript)
    .replace(/[\s,。,.!!??、~～]/g, '')
    .replace(/[啊阿喔哦囉啦呢嘛耶欸]+$/u, '');
  if (!cleaned) return 'unclear';
  if (CONFIRM_WORDS.has(cleaned)) return 'confirm';
  if (CANCEL_WORDS.has(cleaned)) return 'cancel';
  return 'unclear';
}
