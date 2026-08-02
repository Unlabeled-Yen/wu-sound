// Uncoupled Array Designer 演算法 — 乾淨室重製版(TypeScript port)
//
// 來源:對 Uncoupled Array Designer v1.7(林立弘/聲合有限公司)做黑盒逆向工程,
// 用其編譯後的 physics.pyc 當 oracle,窮舉輸入輸出比對抓出公式;公式本身
// 屬公開理論(Bob McCarthy《Sound Systems: Design and Optimization》第 2 章
// point-source array 與 Daniel Lundberg 的公開 Uncoupled Array Calculator)。
// Python 原型 + 2081 組 golden 驗證見 develop/uncoupled-array-mcp/。
//
// 座標系:陣列沿 X 軸展開(y=0),觀眾席在 +Y 方向。
// 角度慣例(沿用 McCarthy 教科書符號):
//   S     相鄰喇叭間距(m)
//   beta  相鄰喇叭之間的張角/splay(deg)
//   phi   單支喇叭 -6dB 覆蓋角(deg)
//   D     到觀眾席的距離(m)
//   N     陣列喇叭數量

// 參考工具將 -3dB 振幅比設為 1/√2(工程近似值,非嚴格物理值 10^(-3/20))。
export const CONST_3DB = 0.70710678;

// 陣列喇叭數量上限(參考工具超過會顯示 "Excessive Quantity" 警告)。
export const MAX_SPEAKERS = 128;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

// -3dB 覆蓋角:參考工具將其模擬為 phi 乘上 CONST_3DB(單位是度,不是弧度)。
function phi3dbDeg(phiDeg: number): number {
  return phiDeg * CONST_3DB;
}

type TargetDb = -3 | -6;

// 單支喇叭在指定 dB 門檻下的覆蓋寬度(fringe)。
function singleWidth(D: number, phiDeg: number, targetDb: TargetDb): number {
  if (targetDb === -6) {
    return 2 * D * Math.sin(toRad(phiDeg / 2));
  }
  return 2 * D * Math.sin(toRad(phi3dbDeg(phiDeg) / 2));
}

// ---------- 核心幾何 ----------

// Unity 交會深度:相鄰喇叭 -6dB 覆蓋圓相交處。beta >= phi(無耦合有間隙)回傳 +Infinity。
export function getDUnity(S: number, betaDeg: number, phiDeg: number): number {
  const delta = (phiDeg - betaDeg) / 2;
  if (delta <= 1e-12) return Infinity;
  return S / (2 * Math.sin(toRad(delta)));
}

// 最大可用深度。phi - 2*beta <= 0(splay 用盡覆蓋角預算)時回傳 0,不是 Infinity。
export function getDMax(S: number, betaDeg: number, phiDeg: number): number {
  const delta = phiDeg - 2 * betaDeg;
  if (delta <= 1e-9) return 0;
  return (S * Math.cos(toRad(betaDeg / 2))) / Math.sin(toRad(delta / 2));
}

// 最小間隙深度:比這個距離近,觀眾會落在相鄰喇叭覆蓋間的空隙。用 -3dB 覆蓋角(非 -6dB)。
export function getDMin(S: number, betaDeg: number, phiDeg: number): number {
  const phi3db = phiDeg * CONST_3DB;
  const delta = (phi3db - betaDeg) / 2;
  if (delta <= 1e-12) return Infinity;
  return S / (2 * Math.sin(toRad(delta)));
}

export interface DistRange {
  dMin: number;
  dUnity: number;
  dMax: number;
}

export function getDistRange(S: number, betaDeg: number, phiDeg: number): DistRange {
  return {
    dMin: getDMin(S, betaDeg, phiDeg),
    dUnity: getDUnity(S, betaDeg, phiDeg),
    dMax: getDMax(S, betaDeg, phiDeg),
  };
}

// ---------- UI 顯示用的投影 Range(Range Min ~ Max) ----------
//
// val_min 精確封閉式(從 getDUnity 解析推導):
//     val_min = (S/2) · cot((phi - beta)/2)
//
// val_max 精確封閉式(2026-07-29 逐句反編譯原軟體 draw_diagram bytecode 取得,
// 取代先前的 oracle 探測表+雙線性插值。原本以為「沒有封閉式」是因為只逆向了
// calc 端;draw_diagram 端的 limit_depth_val 就是同一個量的幾何構造):
//     R = S / (2·sin(β/2 弧度))     (喇叭弧半徑,圓心在陣列後方 (0,-R))
//     val_max = −R + √(R² + d_max² + 2·R·d_max·cos(φ/2 弧度))
// 幾何意義:任一喇叭沿覆蓋錐邊線走 d_max 的端點,到弧心 (0,-R) 的距離減 R
// (跟喇叭在弧上的角度無關,由餘弦定理直接得出)。β→0 極限 = d_max·cos(φ/2),
// 與原軟體 is_linear 分支一致。對舊插值表全網格比對最大相對差 8.9e-6,殘差
// 全部來自舊表只存 6 位小數——即此式為精確解,舊表 0.11% 插值誤差歸零。
export function calcProjectedRange(
  S: number,
  betaDeg: number,
  phiDeg: number,
  dUnity: number,
): { valMin: number; valMax: number } {
  const delta = (phiDeg - betaDeg) / 2;
  const valMin = delta <= 1e-9 ? Infinity : (S / 2) / Math.tan(toRad(delta));

  const dMax = getDMax(S, betaDeg, phiDeg);
  let valMax: number;
  if (!Number.isFinite(dMax)) {
    valMax = Infinity;
  } else if (Math.abs(betaDeg) < 0.1) {
    valMax = dMax * Math.cos(toRad(phiDeg / 2));
  } else {
    const R = S / (2 * Math.sin(toRad(betaDeg / 2)));
    valMax = -R + Math.sqrt(R * R + dMax * dMax + 2 * R * dMax * Math.cos(toRad(phiDeg / 2)));
  }

  return { valMin, valMax };
}

// ---------- 覆蓋寬度 ----------

// 參考工具依 |beta| < 0.1° 分兩種模型(逆向驗證確認,非猜測):
//   beta≈0(平行軸): width = (N-1)*S + singleWidth(target_db) — 直接用傳入的 S
//   beta≠0(張角陣列): -6dB: N*single6;-3dB: (N-1)*single6 + single3 — 完全不用 S
function covWidth(N: number, D: number, S: number, betaDeg: number, phiDeg: number, targetDb: TargetDb): number {
  if (N < 1) throw new Error('N must be >= 1');
  const single6 = singleWidth(D, phiDeg, -6);
  if (Math.abs(betaDeg) < 0.1) {
    const single = singleWidth(D, phiDeg, targetDb);
    const span = N > 1 ? (N - 1) * S : 0;
    return span + single;
  }
  if (targetDb === -6) return N * single6;
  const single3 = singleWidth(D, phiDeg, -3);
  return (N - 1) * single6 + single3;
}

export function calculateWidth(N: number, D: number, S: number, betaDeg: number, phiDeg: number): number {
  return covWidth(N, D, S, betaDeg, phiDeg, -6);
}

export function calculateWidth3db(N: number, D: number, S: number, betaDeg: number, phiDeg: number): number {
  return covWidth(N, D, S, betaDeg, phiDeg, -3);
}

// ---------- 反向求解 ----------

// S = 2*D*sin((phi-beta)/2) — 觀眾弧的弦長。
export function solveForSpacing(D: number, betaDeg: number, phiDeg: number): number {
  const delta = (phiDeg - betaDeg) / 2;
  if (delta <= 1e-12) throw new Error('beta >= phi,無有限間距解');
  return 2 * D * Math.sin(toRad(delta));
}

function solveQty(TargetWidth: number, D: number, S: number, betaDeg: number, phiDeg: number, targetDb: TargetDb): number {
  const unit = singleWidth(D, phiDeg, -6);
  if (unit <= 0) throw new Error('D 與 phi 必須產生正的 unit width');

  let N: number;
  if (Math.abs(betaDeg) < 0.1) {
    const tail = singleWidth(D, phiDeg, targetDb);
    N = Math.max(1, Math.floor((TargetWidth - tail) / unit) + 2);
  } else if (targetDb === -6) {
    N = Math.max(1, Math.floor(TargetWidth / unit) + 1);
  } else {
    const single3 = singleWidth(D, phiDeg, -3);
    N = Math.max(1, Math.floor((TargetWidth - single3) / unit) + 2);
  }

  if (N > MAX_SPEAKERS) throw new Error(`N=${N} 超過 MAX_SPEAKERS=${MAX_SPEAKERS}`);
  return N;
}

export function solveForQty(TargetWidth: number, D: number, S: number, betaDeg: number, phiDeg: number): number {
  return solveQty(TargetWidth, D, S, betaDeg, phiDeg, -6);
}

export function solveForQty3db(TargetWidth: number, D: number, S: number, betaDeg: number, phiDeg: number): number {
  return solveQty(TargetWidth, D, S, betaDeg, phiDeg, -3);
}

export function solveForDistance(S: number, betaDeg: number, phiDeg: number): number {
  return getDUnity(S, betaDeg, phiDeg);
}

// beta 使 S = 2*D*sin((phi-beta)/2)。參考工具在兩種情況 clamp 到 0(皆已驗證):
//   - beta 算出來是負值(S 在零 splay 時就已經超過所需弦長,不需要 splay)
//   - S > 2D(ratio > 1,asin 定義域外)——參考工具同樣回傳 0,不是丟錯誤
export function solveForSplay(D: number, S: number, phiDeg: number): number {
  const ratio = S / (2 * D);
  if (ratio > 1) return 0;
  const delta = toDeg(Math.asin(ratio));
  const beta = phiDeg - 2 * delta;
  return Math.max(0, beta);
}

// ---------- Auto Mode 組合 ----------

export type ForceQty = 'auto' | 'odd' | 'even';

export interface AutoModeResult {
  quantity: number;
  spacingM: number;
  coverageWidth3dbM: number;
  rangeMinM: number;
  rangeMaxM: number;
  unityDist6dbM: number;
  limitDepthM: number; // 原軟體畫布上的 "Limit"(Overlap Limit Arc)= 未投影的 d_max 原值
}

// 重現參考工具 Auto Mode:
//   1. S = solveForSpacing(D, 0, phi) 四捨五入到 0.1(對齊參考工具 spinner 精度)
//   2. N = solveForQty3db(W, D, S, 0, phi)
//   3. Force Qty 調整(odd/even)
//   4. 用最終 N 算實際覆蓋寬度與距離範圍
export function autoMode(
  targetWidth: number,
  audienceDist: number,
  speakerCovDeg: number,
  forceQty: ForceQty = 'auto',
  roundSpacing = true,
): AutoModeResult {
  const D = audienceDist;
  const phi = speakerCovDeg;
  const beta = 0;

  let S = solveForSpacing(D, beta, phi);
  if (roundSpacing) S = Math.round(S * 10) / 10;

  let N = solveForQty3db(targetWidth, D, S, beta, phi);

  if (forceQty === 'odd' && N % 2 === 0) N += 1;
  else if (forceQty === 'even' && N % 2 === 1) N += 1;

  const actualW = calculateWidth3db(N, D, S, beta, phi);
  const { dUnity, dMax } = getDistRange(S, beta, phi);
  const { valMin, valMax } = calcProjectedRange(S, beta, phi, dUnity);

  return {
    quantity: N,
    spacingM: S,
    coverageWidth3dbM: actualW,
    rangeMinM: valMin,
    rangeMaxM: valMax,
    unityDist6dbM: dUnity,
    limitDepthM: dMax,
  };
}

// Auto Mode 的建議數量/建議間距允許手動覆寫(對照原軟體 spinner 旁邊有 Auto
// 按鈕,原本 Wu 沒做這個,是唯讀顯示)。
//
// !! 誠實標注:這個函式的覆寫後重算邏輯是「推論」出來的,不是像 autoMode 本身
// 那樣有 oracle/ground truth 驗證過——原軟體是本機 GUI,沒有暴露這個互動路徑
// 的 API 或 bytecode 可以黑盒探測,也沒有截圖能對照。推論依據:
//   - 覆寫 Spacing、Quantity 維持 Auto → 用新 S 重新 solveForQty3db 求 N,
//     等同「Quantity 分頁」用固定 S 求 N 的邏輯(已驗證的組合模式)。
//   - 覆寫 Quantity、Spacing 維持 Auto → S 不變(S 的計算只依賴 D/phi,不依賴
//     N),只有覆蓋寬度用新 N 重算。
//   - 兩者都覆寫 → 兩者都不重算,只用固定 N/S 算覆蓋寬度與 Range。
// 若之後能取得原軟體實測(截圖或錄影逐步操作 spinner),應優先以那個為準,
// 並在此處更新這段註解與測試。
export function autoModeWithOverride(
  targetWidth: number,
  audienceDist: number,
  speakerCovDeg: number,
  forceQty: ForceQty = 'auto',
  overrideS?: number,
  overrideN?: number,
  roundSpacing = true,
): AutoModeResult {
  const D = audienceDist;
  const phi = speakerCovDeg;
  const beta = 0;

  let S = overrideS ?? solveForSpacing(D, beta, phi);
  if (overrideS === undefined && roundSpacing) S = Math.round(S * 10) / 10;

  let N: number;
  if (overrideN !== undefined) {
    N = overrideN;
  } else {
    N = solveForQty3db(targetWidth, D, S, beta, phi);
    if (forceQty === 'odd' && N % 2 === 0) N += 1;
    else if (forceQty === 'even' && N % 2 === 1) N += 1;
  }

  const actualW = calculateWidth3db(N, D, S, beta, phi);
  const { dUnity, dMax } = getDistRange(S, beta, phi);
  const { valMin, valMax } = calcProjectedRange(S, beta, phi, dUnity);

  return {
    quantity: N,
    spacingM: S,
    coverageWidth3dbM: actualW,
    rangeMinM: valMin,
    rangeMaxM: valMax,
    unityDist6dbM: dUnity,
    limitDepthM: dMax,
  };
}

// ---------- 陣列幾何(座標) ----------

export interface SpeakerPosition {
  x: number;
  y: number;
  tiltDeg: number;
}

export interface ArcInfo {
  R: number;
  betaRad: number;
}

// β≠0 時,y 是負值(喇叭往後彎、遠離觀眾席),不是正值。真執行原軟體
// draw_diagram(bytecode oracle,綁假 canvas 記錄真實座標)驗證:S=5/β=18.83°
// 時外側喇叭座標標籤是 (±9.3, -3.2)、(±4.9, -0.8),不是 (±9.3, 3.2)。幾何上
// 對應圓心在 (0, -R) 的圓弧(不是 (0, R)),弧心在陣列「後方」。
// 詳見 develop/uncoupled-array-mcp/dev/execute_draw_diagram_beta.py。
export function speakerPositions(N: number, S: number, betaDeg: number): SpeakerPosition[] {
  if (Math.abs(betaDeg) < 1e-9) {
    return Array.from({ length: N }, (_, i) => {
      const k = i - (N - 1) / 2;
      return { x: k * S, y: 0, tiltDeg: 0 };
    });
  }
  const br = toRad(betaDeg);
  const R = S / (2 * Math.sin(br / 2));
  return Array.from({ length: N }, (_, i) => {
    const k = i - (N - 1) / 2;
    return {
      x: R * Math.sin(k * br),
      y: -R * (1 - Math.cos(k * br)),
      tiltDeg: k * betaDeg,
    };
  });
}

export function getArcInfo(S: number, betaDeg: number): ArcInfo | null {
  if (Math.abs(betaDeg) < 1e-9) return null;
  const br = toRad(betaDeg);
  return { R: S / (2 * Math.sin(br / 2)), betaRad: br };
}

export type DepthMarker =
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'arc'; cx: number; cy: number; r: number; angStartRad: number; angEndRad: number };

// 畫布上的 Min/Max 背景參考線(原軟體 draw_diagram 內部函式 make_arc_points)。
// 這不是 val_min/val_max(那是另一組「Min:/Max: 文字標籤+短垂直箭頭」,仍用
// calcProjectedRange 算),而是「最外側喇叭的覆蓋錐邊線,在指定深度 dist 處
// 的端點軌跡」——用 dist=unityDistM 畫黃色(gap arc),dist=limitDepthM 畫灰色
// (limit arc)。真執行原軟體 bytecode 逐句反編譯取得,並用 N=5/S=5/β=18.83°/
// φ=110° 案例對真實 canvas 座標數值驗證(誤差 <0.01m)。
//
// β=0 時退化為一條有限寬度的水平線(不是貫穿全畫布):
//   depth = dist·cos(φ/2 弧度)、寬度端點 = ±[(N-1)S/2 + dist·sin(φ/2 弧度)]
// β≠0 時是圓弧,圓心在 (0, -R)(跟喇叭弧共用同一個焦點),半徑由「最外側喇叭
// 位置 + 沿覆蓋錐邊線走 dist」的端點到圓心的距離決定(非簡單 R+dist)。
export function depthMarker(N: number, S: number, betaDeg: number, phiDeg: number, dist: number): DepthMarker | null {
  if (!Number.isFinite(dist) || dist <= 0) return null;
  const halfAngleRad = toRad(phiDeg / 2);
  const br = toRad(betaDeg);
  const isLinear = Math.abs(betaDeg) < 0.1;

  if (isLinear) {
    const halfPhys = ((N - 1) * S) / 2;
    const depth = dist * Math.cos(halfAngleRad);
    const half = halfPhys + dist * Math.sin(halfAngleRad);
    return { kind: 'line', x1: -half, y1: depth, x2: half, y2: depth };
  }

  const R = S / (2 * Math.sin(br / 2));
  const idxFirst = -(N - 1) / 2;
  const angFirstSpk = idxFirst * br;
  const beamAngL = angFirstSpk - halfAngleRad;
  const tipLx = R * Math.sin(angFirstSpk) + dist * Math.sin(beamAngL);
  const tipLy = R * Math.cos(angFirstSpk) + dist * Math.cos(beamAngL);

  const idxLast = (N - 1) / 2;
  const angLastSpk = idxLast * br;
  const beamAngR = angLastSpk + halfAngleRad;
  const tipRx = R * Math.sin(angLastSpk) + dist * Math.sin(beamAngR);
  const tipRy = R * Math.cos(angLastSpk) + dist * Math.cos(beamAngR);

  const angStartArc = Math.atan2(tipLx, tipLy);
  const angEndArc = Math.atan2(tipRx, tipRy);
  const rArc = Math.hypot(tipLx, tipLy);

  return { kind: 'arc', cx: 0, cy: -R, r: rArc, angStartRad: angStartArc, angEndRad: angEndArc };
}

// Min 深度圓點(黃色):每支喇叭沿覆蓋錐左右邊線走 unityDist 的兩個點
// (逐句反編譯 draw_diagram 逐喇叭迴圈確認:dot = speaker + unityDist·
// (sin(tilt±φ/2), cos(tilt±φ/2)),用的是 D_unity 原始值,不是投影 val_min)。
// 相鄰喇叭的相向邊線在 unity 深度精確交會(unity 的定義),所以 2N 個點重疊
// 繪製後視覺上是 N+1 個。
export function unityDots(N: number, S: number, betaDeg: number, phiDeg: number, unityDist: number): { x: number; y: number }[] {
  if (!Number.isFinite(unityDist) || unityDist <= 0) return [];
  const halfRad = toRad(phiDeg / 2);
  return speakerPositions(N, S, betaDeg).flatMap((s) => {
    const tiltRad = toRad(s.tiltDeg);
    return [
      { x: s.x + unityDist * Math.sin(tiltRad - halfRad), y: s.y + unityDist * Math.cos(tiltRad - halfRad) },
      { x: s.x + unityDist * Math.sin(tiltRad + halfRad), y: s.y + unityDist * Math.cos(tiltRad + halfRad) },
    ];
  });
}

export interface UnityRay {
  x: number;
  y: number;
  angleRad: number;
}

// Unity/Limit 射線(逐句反編譯 draw_diagram 的 target_indices 選擇邏輯確認):
// 發射端 = N 奇數 → 中央那 1 支((N-1)//2);N 偶數 → 中央 2 支(N/2-1, N/2)。
// 每支發 2 條,角度 = tilt ± φ/2(即自己的覆蓋錐左右邊線方向)。
// 繪製規則(draw_multi_colored_ray):黃段 = 沿射線距離 0→unityDist(原始
// D_unity),灰段 = unityDist→limitDepth(原始 d_max)。是「沿射線的距離」,
// 不是深度截距——先前用 (dMin−y)/cos(角度) 算深度截距是錯的。
export function unityRays(N: number, S: number, betaDeg: number, phiDeg: number): UnityRay[] {
  const positions = speakerPositions(N, S, betaDeg);
  const emitters = N % 2 === 1 ? [Math.floor((N - 1) / 2)] : [Math.floor(N / 2) - 1, Math.floor(N / 2)];
  const halfRad = toRad(phiDeg / 2);
  return emitters.flatMap((i) => {
    const s = positions[i];
    if (!s) return [];
    const tiltRad = toRad(s.tiltDeg);
    return [
      { x: s.x, y: s.y, angleRad: tiltRad - halfRad },
      { x: s.x, y: s.y, angleRad: tiltRad + halfRad },
    ];
  });
}

// Min 垂直箭頭(畫布中軸那條)的轉折深度。逐句反編譯確認:
//   β=0 → unityDist·cos(φ/2 弧度)(等於 val_min,標籤與箭頭終點重合)
//   β≠0 → −R + √(R² + unityDist² + 2·R·unityDist·cos(φ/2 弧度))
//         (gap arc 的頂點深度;此時「Min: x.xm」標籤值 val_min 與箭頭終點
//          深度是兩個不同的數——原軟體本來就如此,標籤示物理量、箭頭示弧頂)
// Max 箭頭終點 = val_max(見 calcProjectedRange,同一個閉合式),不需另外算。
export function minArrowDepthM(S: number, betaDeg: number, phiDeg: number, unityDist: number): number {
  if (!Number.isFinite(unityDist) || unityDist <= 0) return NaN;
  const c = Math.cos(toRad(phiDeg / 2));
  if (Math.abs(betaDeg) < 0.1) return unityDist * c;
  const R = S / (2 * Math.sin(toRad(betaDeg / 2)));
  return -R + Math.sqrt(R * R + unityDist * unityDist + 2 * R * unityDist * c);
}

// ---------- 其他四個分頁(Quantity / Unity / Spacing / Splay) ----------
//
// 接線邏輯從 calc.pyc 各分頁方法引用的名稱推得,四個分頁共用同一套組合:
// getDistRange + calculateWidth(3db) + calcProjectedRange。已用 3000 組
// oracle-grounded golden 驗證(含 beta≠0),見 develop/uncoupled-array-mcp/。

export interface TabResult {
  actualWidthM: number;
  suggestedWidthM: number;
  rangeMinM: number;
  rangeMaxM: number;
  dMinM: number;
  dMaxM: number;
}

export interface TabQuantityResult extends TabResult {
  quantity: number;
  unityDistM: number;
}

// 'Quantity' 分頁:給定目標寬度 + S/beta/phi,求所需 N。
// D 不是自由輸入——UI 內部把它算成 unity distance(唯讀顯示為 "Unity Dist (-6dB)"),
// 並用它當距離做寬度/N 計算。已對照真實截圖驗證:S=7, phi=110, target=28 -> Unity=4.3, N=5。
export function tabQuantity(targetWidth: number, S: number, betaDeg: number, phiDeg: number): TabQuantityResult {
  const D = getDUnity(S, betaDeg, phiDeg);
  const N = solveForQty3db(targetWidth, D, S, betaDeg, phiDeg);
  const actualW = calculateWidth(N, D, S, betaDeg, phiDeg);
  const suggW = calculateWidth3db(N, D, S, betaDeg, phiDeg);
  const { dMin, dUnity, dMax } = getDistRange(S, betaDeg, phiDeg);
  const { valMin, valMax } = calcProjectedRange(S, betaDeg, phiDeg, dUnity);
  return {
    quantity: N, actualWidthM: actualW, suggestedWidthM: suggW,
    rangeMinM: valMin, rangeMaxM: valMax, unityDistM: dUnity,
    dMinM: dMin, dMaxM: dMax,
  };
}

export interface TabUnityResult extends TabResult {
  unityDistM: number;
}

// 'Unity' 分頁:給定 N/S/beta/phi,求 unity distance + 對應寬度。
export function tabUnity(N: number, S: number, betaDeg: number, phiDeg: number): TabUnityResult {
  const D = solveForDistance(S, betaDeg, phiDeg);
  const actualW = calculateWidth(N, D, S, betaDeg, phiDeg);
  const suggW = calculateWidth3db(N, D, S, betaDeg, phiDeg);
  const { dMin, dUnity, dMax } = getDistRange(S, betaDeg, phiDeg);
  const { valMin, valMax } = calcProjectedRange(S, betaDeg, phiDeg, dUnity);
  return {
    unityDistM: D, actualWidthM: actualW, suggestedWidthM: suggW,
    rangeMinM: valMin, rangeMaxM: valMax,
    dMinM: dMin, dMaxM: dMax,
  };
}

export interface TabSpacingResult extends TabResult {
  spacingM: number;
}

// 'Spacing' 分頁:給定 N/D/beta/phi,求所需間距 S。
export function tabSpacing(N: number, D: number, betaDeg: number, phiDeg: number): TabSpacingResult {
  const S = solveForSpacing(D, betaDeg, phiDeg);
  const actualW = calculateWidth(N, D, S, betaDeg, phiDeg);
  const suggW = calculateWidth3db(N, D, S, betaDeg, phiDeg);
  const { dMin, dUnity, dMax } = getDistRange(S, betaDeg, phiDeg);
  const { valMin, valMax } = calcProjectedRange(S, betaDeg, phiDeg, dUnity);
  return {
    spacingM: S, actualWidthM: actualW, suggestedWidthM: suggW,
    rangeMinM: valMin, rangeMaxM: valMax,
    dMinM: dMin, dMaxM: dMax,
  };
}

export interface TabSplayResult extends TabResult {
  splayDeg: number;
}

// 'Splay' 分頁:給定 N/D/S/phi,求所需張角 beta。
export function tabSplay(N: number, D: number, S: number, phiDeg: number): TabSplayResult {
  const betaDeg = solveForSplay(D, S, phiDeg);
  const actualW = calculateWidth(N, D, S, betaDeg, phiDeg);
  const suggW = calculateWidth3db(N, D, S, betaDeg, phiDeg);
  const { dMin, dUnity, dMax } = getDistRange(S, betaDeg, phiDeg);
  const { valMin, valMax } = calcProjectedRange(S, betaDeg, phiDeg, dUnity);
  return {
    splayDeg: betaDeg, actualWidthM: actualW, suggestedWidthM: suggW,
    rangeMinM: valMin, rangeMaxM: valMax,
    dMinM: dMin, dMaxM: dMax,
  };
}
