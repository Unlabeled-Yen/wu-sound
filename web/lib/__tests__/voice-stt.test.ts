import { describe, expect, it } from 'vitest';
import { looksLikePromptEcho } from '@/lib/voice-stt';

/**
 * 辨識模型「回吐提示詞」的偵測。
 *
 * 這道防線的存在理由是實測踩到的事故:音檔太短時模型會編造內容,
 * 而且編出來的字都來自我們給的熱詞提示,結果使用者看到一句自己沒講過的話
 * 被當成他講的。這比辨識錯更危險,因為看起來很合理。
 *
 * 測試重點是**不能誤擋合法輸入**——誤擋會讓使用者講不進去,
 * 那個代價比偶爾放過一句編造的還高。
 */

const VOCAB =
  'THE HOPE Taipei、北屯旌旗、恩光堂、斗六旌旗、新竹旌旗、磐頂長老教會、豐原旌旗、' +
  '木作、放樣、監工、進場、收邊、天花、線槽、音響定位、喇叭、擴大機、混音器、訊號線、吊掛、陣列、調音、驗收';
const PROMPT = `請只轉寫音訊中實際聽到的內容。可能出現的專有名詞供參考:${VOCAB}`;

/** 真人講 11 秒的錄音大約這個大小(Opus 約 7KB/秒) */
const ELEVEN_SEC = 168_276;
/** 講一句短案名大約 2 秒 */
const TWO_SEC = 14_000;

describe('回吐提示詞偵測', () => {
  it('擋掉實測抓到的編造樣本(短,且每個字都來自提示詞)', () => {
    for (const echo of ['木。', '喇叭', '混。', '收邊', '天花', '木作', '音響']) {
      expect(looksLikePromptEcho(echo, PROMPT), echo).toBe(true);
    }
  });

  it('擋掉整份詞彙表被原封不動吐回來——Yen 講 11 秒卻收到這個', () => {
    // 這是最初的事故:裸詞彙表提示讓模型直接複製貼上整份清單當轉寫結果
    expect(looksLikePromptEcho(VOCAB, PROMPT, ELEVEN_SEC)).toBe(true);
    // 沒有音檔大小資訊時也要擋——清單長到不可能是人講的話
    expect(looksLikePromptEcho(VOCAB, PROMPT)).toBe(true);
  });

  it('講了很久卻只吐出一個案名 → 回吐;真的講那個案名 → 放行', () => {
    // 同樣的輸出,靠錄音長度分辨是「模型沒在聽」還是「使用者真的只講了案名」
    expect(looksLikePromptEcho('THE HOPE Taipei', PROMPT, ELEVEN_SEC)).toBe(true);
    // 回答「這是要記到哪個專案?」時只講案名是合法的,不能擋
    expect(looksLikePromptEcho('THE HOPE Taipei', PROMPT, TWO_SEC)).toBe(false);
    expect(looksLikePromptEcho('磐頂長老教會', PROMPT, TWO_SEC)).toBe(false);
  });

  it('不擋語音確認口令——那些字不在提示詞裡,而且是寫入流程的關鍵', () => {
    // 誤擋這些會讓語音確認整條路斷掉,比放過一句編造嚴重得多
    for (const cmd of ['確認', '取消', '對', '沒錯', '不對']) {
      expect(looksLikePromptEcho(cmd, PROMPT), cmd).toBe(false);
    }
  });

  it('不擋完整句子,就算裡面用到熱詞——那正是熱詞的用途', () => {
    for (const real of [
      '幫我在磐頂長老教會記一筆,木作進場前先放樣',
      '喇叭的位置有點怪怪的,要再移動一下',
      '線槽還沒收邊',
    ]) {
      expect(looksLikePromptEcho(real, PROMPT), real).toBe(false);
    }
  });

  it('沒有提示詞時不做這個判斷(不能無中生有地擋)', () => {
    expect(looksLikePromptEcho('喇叭', '')).toBe(false);
  });

  it('空字串不算回吐(那是另一種錯誤,由 STT_EMPTY 處理)', () => {
    expect(looksLikePromptEcho('', PROMPT)).toBe(false);
    expect(looksLikePromptEcho('。', PROMPT)).toBe(false);
  });
});
