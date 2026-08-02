// 系統 SPL 預算法:用喇叭最大音壓反推可涵蓋的最遠距離。
// 公式:預算(dB) = 喇叭最大音壓 - 目標音壓 + 左右聲道疊加 - 演出動態餘裕 - 系統安全餘裕
// 距離衰減走自由場反平方定律:20*log10(距離/基準距離)。

export interface SplBudgetInput {
  maxSplDb: number; // 喇叭規格最大音壓(dB SPL)
  refDistanceM: number; // 上面數值的量測基準距離(公尺),多數規格標示為 1m
  targetSplDb: number; // 目標音壓(dB SPL),觀眾席平均感受音壓
  stereoSumDb: number; // 左右聲道疊加加成(dB),等距雙聲道保守估計常抓 +3
  dynamicHeadroomDb: number; // 演出動態餘裕(dB),峰值超過平均音壓的幅度
  safetyMarginDb: number; // 系統安全餘裕(dB),涵蓋器材老化/削波保護/天候變化
}

export interface SplBudgetResult {
  budgetDb: number; // 扣除各項後,可分配給距離衰減的預算
  theoreticalMaxThrowM: number; // 自由場反平方定律理論可達距離
  recommendedMaxThrowM: number; // 理論值打 9 折,留現場誤差空間
  warnings: string[];
}

// budgetDb <= 0 代表在基準距離內都打不到目標音壓,此時距離無意義故回傳 0。
export function computeSplBudget(input: SplBudgetInput): SplBudgetResult {
  const budgetDb =
    input.maxSplDb - input.targetSplDb + input.stereoSumDb - input.dynamicHeadroomDb - input.safetyMarginDb;

  const warnings: string[] = [
    '此為自由場反平方定律理論值,未計入功率壓縮、地面反射、空氣吸收等現場變因,實際佈點仍需現場覆核。',
  ];

  if (input.refDistanceM <= 0) {
    warnings.unshift('基準距離必須大於 0。');
    return { budgetDb, theoreticalMaxThrowM: 0, recommendedMaxThrowM: 0, warnings };
  }

  if (budgetDb <= 0) {
    warnings.unshift('預算 ≤ 0dB:在基準距離內都無法達到目標音壓,請重新檢視音壓需求或器材規格。');
    return { budgetDb, theoreticalMaxThrowM: 0, recommendedMaxThrowM: 0, warnings };
  }

  const theoreticalMaxThrowM = input.refDistanceM * Math.pow(10, budgetDb / 20);
  const recommendedMaxThrowM = theoreticalMaxThrowM * 0.9;

  return { budgetDb, theoreticalMaxThrowM, recommendedMaxThrowM, warnings };
}

// 給定距離,回推自由場反平方定律的衰減量(dB),供結果頁「這個距離扣多少 dB」對照用。
export function distanceAttenuationDb(distanceM: number, refDistanceM: number): number {
  if (distanceM <= 0 || refDistanceM <= 0) return 0;
  return 20 * Math.log10(distanceM / refDistanceM);
}

// 擴大機推力計算:一台擴大機把一顆特定靈敏度的喇叭能推到多少 dB SPL @1m。
// 公式:推力 SPL = 靈敏度(dB @1W/1m) + 10*log10(功率 W)
// 阻抗匹配問題不在此處理——輸入的功率視為「實際負載下」的有效功率,由使用者對規格負責。
export interface AmpDriveInput {
  sensitivityDb: number; // 喇叭靈敏度(dB @1W/1m)
  ampPowerW: number; // 擴大機功率(W)
}

export type AmpMatchVerdict = 'underpowered' | 'matched' | 'over-driving';

export interface AmpDriveResult {
  ampDriveSplDb: number; // 擴大機能把此喇叭推到的 SPL @1m
}

export function computeAmpDrive(input: AmpDriveInput): AmpDriveResult | null {
  if (!Number.isFinite(input.sensitivityDb) || !Number.isFinite(input.ampPowerW)) return null;
  if (input.ampPowerW <= 0) return null;
  return { ampDriveSplDb: input.sensitivityDb + 10 * Math.log10(input.ampPowerW) };
}

// 給定擴大機推力與喇叭極限,判斷匹配狀態並回傳「實際可達最大音壓」(取較小者)。
// matched 抓 ±1dB 容忍範圍——器材規格本身就有這個量級的公差。
export interface AmpMatchInput {
  ampDriveSplDb: number;
  speakerMaxSplDb: number;
}

export interface AmpMatchResult {
  effectiveMaxSplDb: number; // 系統實際可達最大音壓,拿去餵距離預算
  verdict: AmpMatchVerdict;
  gapDb: number; // 推力 - 極限,正值代表過推、負值代表推不足
}

export function evaluateAmpMatch(input: AmpMatchInput): AmpMatchResult {
  const gapDb = input.ampDriveSplDb - input.speakerMaxSplDb;
  let verdict: AmpMatchVerdict;
  if (gapDb > 1) verdict = 'over-driving';
  else if (gapDb < -1) verdict = 'underpowered';
  else verdict = 'matched';
  const effectiveMaxSplDb = Math.min(input.ampDriveSplDb, input.speakerMaxSplDb);
  return { effectiveMaxSplDb, verdict, gapDb };
}
