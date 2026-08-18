// SPL 預算計算的公式正確性測試(lib/spl-budget.ts 之前完全沒有測試覆蓋)。
//
// computeSplBudget:預算(dB) = 最大音壓 - 目標音壓 + 聲道疊加 - 動態餘裕 - 安全餘裕,
// 距離走自由場反平方定律 20*log10(距離/基準距離),反推 theoreticalMaxThrowM = 基準距離 * 10^(預算/20)。
// 用手算的已知案例驗證公式沒有被打錯符號或算式順序。

import { describe, expect, it } from 'vitest';
import {
  computeSplBudget,
  distanceAttenuationDb,
  computeAmpDrive,
  evaluateAmpMatch,
} from '../spl-budget';

describe('computeSplBudget', () => {
  it('手算案例:130.5 + 3 - 90 - 12 - 6 = 25.5 dB 預算,基準距離 1m', () => {
    const r = computeSplBudget({
      maxSplDb: 130.5,
      refDistanceM: 1,
      targetSplDb: 90,
      stereoSumDb: 3,
      dynamicHeadroomDb: 12,
      safetyMarginDb: 6,
    });
    expect(r.budgetDb).toBeCloseTo(25.5, 9);
    // 10^(25.5/20) = 18.8365...
    expect(r.theoreticalMaxThrowM).toBeCloseTo(1 * Math.pow(10, 25.5 / 20), 9);
    expect(r.theoreticalMaxThrowM).toBeCloseTo(18.836, 3);
    expect(r.recommendedMaxThrowM).toBeCloseTo(r.theoreticalMaxThrowM * 0.9, 9);
    expect(r.warnings).toHaveLength(1); // 只有免責聲明,沒有錯誤
  });

  it('基準距離不是 1m 時,理論距離跟著基準距離等比例縮放', () => {
    const r = computeSplBudget({
      maxSplDb: 136, refDistanceM: 2, targetSplDb: 90,
      stereoSumDb: 3, dynamicHeadroomDb: 12, safetyMarginDb: 6,
    });
    const expectedBudget = 136 - 90 + 3 - 12 - 6; // 31
    expect(r.budgetDb).toBeCloseTo(expectedBudget, 9);
    expect(r.theoreticalMaxThrowM).toBeCloseTo(2 * Math.pow(10, expectedBudget / 20), 9);
  });

  it('預算 <= 0dB:距離無意義,回傳 0 並帶錯誤警告在最前面', () => {
    const r = computeSplBudget({
      maxSplDb: 90, refDistanceM: 1, targetSplDb: 90,
      stereoSumDb: 0, dynamicHeadroomDb: 12, safetyMarginDb: 6,
    });
    expect(r.budgetDb).toBeLessThanOrEqual(0);
    expect(r.theoreticalMaxThrowM).toBe(0);
    expect(r.recommendedMaxThrowM).toBe(0);
    expect(r.warnings[0]).toContain('預算 ≤ 0dB');
  });

  it('budgetDb 恰好等於 0:邊界情況也視為無法達標(<=0,不是 <0)', () => {
    const r = computeSplBudget({
      maxSplDb: 90, refDistanceM: 1, targetSplDb: 90,
      stereoSumDb: 0, dynamicHeadroomDb: 0, safetyMarginDb: 0,
    });
    expect(r.budgetDb).toBe(0);
    expect(r.theoreticalMaxThrowM).toBe(0);
  });

  it('基準距離 <= 0:回傳 0 並帶專屬警告,不整除以零', () => {
    const r = computeSplBudget({
      maxSplDb: 136, refDistanceM: 0, targetSplDb: 90,
      stereoSumDb: 3, dynamicHeadroomDb: 12, safetyMarginDb: 6,
    });
    expect(r.theoreticalMaxThrowM).toBe(0);
    expect(r.recommendedMaxThrowM).toBe(0);
    expect(r.warnings[0]).toContain('基準距離必須大於 0');
  });

  it('recommendedMaxThrowM 恆為 theoreticalMaxThrowM 的 9 折', () => {
    const r = computeSplBudget({
      maxSplDb: 142, refDistanceM: 1, targetSplDb: 95,
      stereoSumDb: 3, dynamicHeadroomDb: 10, safetyMarginDb: 4,
    });
    expect(r.recommendedMaxThrowM / r.theoreticalMaxThrowM).toBeCloseTo(0.9, 9);
  });
});

describe('distanceAttenuationDb', () => {
  it('距離等於基準距離:衰減為 0', () => {
    expect(distanceAttenuationDb(1, 1)).toBe(0);
    expect(distanceAttenuationDb(5, 5)).toBe(0);
  });

  it('距離是基準距離的 10 倍:反平方定律衰減 20dB', () => {
    expect(distanceAttenuationDb(10, 1)).toBeCloseTo(20, 9);
  });

  it('距離是基準距離的 2 倍:衰減 20*log10(2) ≈ 6.02dB', () => {
    expect(distanceAttenuationDb(2, 1)).toBeCloseTo(20 * Math.log10(2), 9);
  });

  it('距離小於基準距離:衰減為負值(比基準距離更近反而更大聲)', () => {
    expect(distanceAttenuationDb(0.5, 1)).toBeLessThan(0);
  });

  it('距離或基準距離 <= 0:回傳 0,不噴 NaN/Infinity', () => {
    expect(distanceAttenuationDb(0, 1)).toBe(0);
    expect(distanceAttenuationDb(-5, 1)).toBe(0);
    expect(distanceAttenuationDb(10, 0)).toBe(0);
  });
});

describe('computeAmpDrive', () => {
  it('手算案例:靈敏度 100dB + 10*log10(400W) ≈ 126.02dB', () => {
    const r = computeAmpDrive({ sensitivityDb: 100, ampPowerW: 400 });
    expect(r).not.toBeNull();
    expect(r!.ampDriveSplDb).toBeCloseTo(100 + 10 * Math.log10(400), 9);
  });

  it('功率 1W 時,推力等於靈敏度本身(10*log10(1)=0)', () => {
    const r = computeAmpDrive({ sensitivityDb: 105.5, ampPowerW: 1 });
    expect(r!.ampDriveSplDb).toBeCloseTo(105.5, 9);
  });

  it('功率 <= 0:回傳 null,不噴 -Infinity', () => {
    expect(computeAmpDrive({ sensitivityDb: 100, ampPowerW: 0 })).toBeNull();
    expect(computeAmpDrive({ sensitivityDb: 100, ampPowerW: -10 })).toBeNull();
  });

  it('輸入非有限數:回傳 null', () => {
    expect(computeAmpDrive({ sensitivityDb: NaN, ampPowerW: 400 })).toBeNull();
    expect(computeAmpDrive({ sensitivityDb: 100, ampPowerW: Infinity })).toBeNull();
  });
});

describe('evaluateAmpMatch', () => {
  it('推力遠大於喇叭極限:over-driving,採較小值(喇叭極限)', () => {
    const r = evaluateAmpMatch({ ampDriveSplDb: 140, speakerMaxSplDb: 130 });
    expect(r.verdict).toBe('over-driving');
    expect(r.gapDb).toBeCloseTo(10, 9);
    expect(r.effectiveMaxSplDb).toBe(130);
  });

  it('推力遠小於喇叭極限:underpowered,採較小值(擴大機推力)', () => {
    const r = evaluateAmpMatch({ ampDriveSplDb: 120, speakerMaxSplDb: 136 });
    expect(r.verdict).toBe('underpowered');
    expect(r.gapDb).toBeCloseTo(-16, 9);
    expect(r.effectiveMaxSplDb).toBe(120);
  });

  it('推力與極限完全相等:matched,gap=0', () => {
    const r = evaluateAmpMatch({ ampDriveSplDb: 130, speakerMaxSplDb: 130 });
    expect(r.verdict).toBe('matched');
    expect(r.gapDb).toBe(0);
    expect(r.effectiveMaxSplDb).toBe(130);
  });

  it('容忍邊界:gap 恰好 +1dB 仍算 matched(> 1 才算 over-driving)', () => {
    const r = evaluateAmpMatch({ ampDriveSplDb: 131, speakerMaxSplDb: 130 });
    expect(r.verdict).toBe('matched');
  });

  it('容忍邊界:gap 恰好 -1dB 仍算 matched(< -1 才算 underpowered)', () => {
    const r = evaluateAmpMatch({ ampDriveSplDb: 129, speakerMaxSplDb: 130 });
    expect(r.verdict).toBe('matched');
  });

  it('容忍邊界:gap 略大於 +1dB(+1.001)判定翻到 over-driving', () => {
    const r = evaluateAmpMatch({ ampDriveSplDb: 131.001, speakerMaxSplDb: 130 });
    expect(r.verdict).toBe('over-driving');
  });

  it('容忍邊界:gap 略小於 -1dB(-1.001)判定翻到 underpowered', () => {
    const r = evaluateAmpMatch({ ampDriveSplDb: 128.999, speakerMaxSplDb: 130 });
    expect(r.verdict).toBe('underpowered');
  });
});
