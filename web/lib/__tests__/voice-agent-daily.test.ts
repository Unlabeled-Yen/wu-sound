import { describe, expect, it } from 'vitest';
import { EMERGENCY_INFO, getEmergencyInfo, getNow, normalizeCity } from '@/lib/voice-agent-daily';

/**
 * 民生/救難工具。這些工具存在的理由是「不讓模型憑印象回答有正確答案的問題」,
 * 所以測的重點是:資料真的來自這裡,而且查不到時會明講查不到。
 */

describe('get_now', () => {
  it('時間來自伺服器時鐘且用台北時區,不是模型算的', () => {
    // 2026-08-14 02:00 UTC = 台北 10:00 同日(星期五)
    expect(getNow(Date.parse('2026-08-14T02:00:00Z'))).toMatchObject({
      date: '2026-08-14',
      weekday: '星期五',
      timezone: 'Asia/Taipei',
    });
  });

  it('UTC 還是前一天的深夜時,台北已經跨日', () => {
    expect(getNow(Date.parse('2026-08-14T17:00:00Z'))).toMatchObject({
      date: '2026-08-15',
      weekday: '星期六',
    });
  });
});

describe('地名正規化', () => {
  it('「台中」補成「臺中市」', () => {
    expect(normalizeCity('台中')).toBe('臺中市');
    expect(normalizeCity('臺中市')).toBe('臺中市');
    expect(normalizeCity('高雄')).toBe('高雄市');
    expect(normalizeCity('南投')).toBe('南投縣');
  });

  it('區級地名與亂寫的地名一律回 null,不做模糊比對', () => {
    // 查錯地點卻回一個看起來正常的天氣,是最糟的失敗方式
    expect(normalizeCity('豐原')).toBeNull();
    expect(normalizeCity('北屯')).toBeNull();
    expect(normalizeCity('火星')).toBeNull();
  });
});

describe('救難資訊', () => {
  it('內容是系統寫死的,不是模型生成的醫療建議', () => {
    const r = getEmergencyInfo('electric_shock');
    expect(r.ok).toBe(true);
    expect(r.data.guidance).toBe(EMERGENCY_INFO.electric_shock);
    expect(String(r.data.guidance)).toContain('先切斷電源');
    expect(String(r.data.numbers)).toContain('119');
  });

  it('沒給或給了不認得的 topic → 退到 general,不會回空的', () => {
    expect(getEmergencyInfo().data.topic).toBe('general');
    expect(getEmergencyInfo('外星人攻擊').data.topic).toBe('general');
    expect(String(getEmergencyInfo('外星人攻擊').data.guidance)).toContain('119');
  });

  it('每個 topic 都講到打 119,沒有一條漏掉求救這一步', () => {
    for (const [topic, text] of Object.entries(EMERGENCY_INFO)) {
      expect(text, `${topic} 沒提到 119`).toContain('119');
    }
  });
});
