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

// 提示詞現在只有詞彙表,沒有敘述句——敘述句被證實是編造的元兇,已移除
const PROMPT =
  '磐頂長老教會、北屯旌旗、恩光堂、木作、放樣、監工、進場、收邊、天花、線槽、' +
  '音響定位、喇叭、擴大機、混音器、訊號線、吊掛、陣列、調音、驗收';

describe('回吐提示詞偵測', () => {
  it('擋掉實測抓到的編造樣本(短,且每個字都來自提示詞)', () => {
    // 拿掉敘述句之後,聽不清的音檔會吐零散單詞而不是編成句子——正是這裡要接住的
    for (const echo of ['木。', '喇叭', '混。', '收邊', '天花', '木作', '音響']) {
      expect(looksLikePromptEcho(echo, PROMPT), echo).toBe(true);
    }
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
