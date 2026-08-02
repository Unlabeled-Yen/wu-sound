// autoModeWithOverride 的一致性測試——不是 golden 測試,因為這個互動路徑
// (Auto Mode 的 Rec. Quantity / Rec. Spacing 手動覆寫)沒有原軟體 ground truth
// 可對照(見 array-designer.ts 裡 autoModeWithOverride 上方的推論依據說明)。
// 這裡驗證的是「覆寫邏輯內部自洽」:沒覆寫時等於 autoMode;覆寫一項時另一項
// 用哪個公式重算;兩項都覆寫時完全不重算。

import { describe, expect, it } from 'vitest';
import {
  autoMode, autoModeWithOverride, solveForQty3db, calculateWidth3db, getDistRange, calcProjectedRange,
} from '../array-designer';

describe('autoModeWithOverride', () => {
  it('無覆寫時與 autoMode 完全一致', () => {
    const base = autoMode(20, 5, 90, 'auto');
    const withOverride = autoModeWithOverride(20, 5, 90, 'auto');
    expect(withOverride).toEqual(base);
  });

  it('只覆寫 Spacing:N 用新 S 重新 solveForQty3db 求出,等同 Quantity 分頁的邏輯', () => {
    const targetWidth = 20, D = 5, phi = 90;
    const overrideS = 6.0;
    const result = autoModeWithOverride(targetWidth, D, phi, 'auto', overrideS, undefined);
    const expectedN = solveForQty3db(targetWidth, D, overrideS, 0, phi);
    expect(result.spacingM).toBe(overrideS);
    expect(result.quantity).toBe(expectedN);
    expect(result.coverageWidth3dbM).toBeCloseTo(calculateWidth3db(expectedN, D, overrideS, 0, phi), 9);
  });

  it('只覆寫 Quantity:S 維持 auto 計算值不變,覆蓋寬度用新 N 重算', () => {
    const targetWidth = 20, D = 5, phi = 90;
    const auto = autoMode(targetWidth, D, phi, 'auto');
    const overrideN = auto.quantity + 2;
    const result = autoModeWithOverride(targetWidth, D, phi, 'auto', undefined, overrideN);
    expect(result.spacingM).toBe(auto.spacingM);
    expect(result.quantity).toBe(overrideN);
    expect(result.coverageWidth3dbM).toBeCloseTo(calculateWidth3db(overrideN, D, auto.spacingM, 0, phi), 9);
  });

  it('兩者都覆寫:N/S 完全固定,只有覆蓋寬度與 Range 隨之重算', () => {
    const targetWidth = 20, D = 5, phi = 90;
    const overrideS = 6.5, overrideN = 3;
    const result = autoModeWithOverride(targetWidth, D, phi, 'auto', overrideS, overrideN);
    expect(result.spacingM).toBe(overrideS);
    expect(result.quantity).toBe(overrideN);
    const { dUnity, dMax } = getDistRange(overrideS, 0, phi);
    const { valMin, valMax } = calcProjectedRange(overrideS, 0, phi, dUnity);
    expect(result.coverageWidth3dbM).toBeCloseTo(calculateWidth3db(overrideN, D, overrideS, 0, phi), 9);
    expect(result.rangeMinM).toBeCloseTo(valMin, 9);
    expect(result.rangeMaxM).toBeCloseTo(valMax, 9);
    expect(result.unityDist6dbM).toBeCloseTo(dUnity, 9);
    expect(result.limitDepthM).toBeCloseTo(dMax, 9);
  });

  it('覆寫 Quantity 時,Force Qty(odd/even)不套用——使用者已經給了精確數字', () => {
    const targetWidth = 20, D = 5, phi = 90;
    const result = autoModeWithOverride(targetWidth, D, phi, 'even', undefined, 5);
    expect(result.quantity).toBe(5); // 維持奇數,不因 forceQty='even' 被強制 +1
  });
});
