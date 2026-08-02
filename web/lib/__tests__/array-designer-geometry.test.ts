import { describe, it, expect } from 'vitest';
import { speakerPositions, getArcInfo, depthMarker, unityDots, unityRays, minArrowDepthM, calcProjectedRange } from '../array-designer';

// β≠0 的所有座標都對照「真執行原軟體 draw_diagram」的 ground truth 校正過
// (bytecode oracle,綁假 canvas 記錄真實呼叫,見
// develop/uncoupled-array-mcp/dev/execute_draw_diagram_beta.py)。案例參數
// 是 Splay 分頁預設值:N=5, S=5.0, φ=110°, Target Unity=3.5 → β=18.8306174°。
const N = 5, S = 5, PHI = 110, BETA = 18.830617194385937;
const D_UNITY = 3.5, D_MAX = 8.357940829214266;
const R = 15.282149362087308;

describe('speakerPositions', () => {
  it('β=0: N=5 S=5 排成直線', () => {
    const pos = speakerPositions(5, 5, 0);
    expect(pos).toHaveLength(5);
    expect(pos.map(p => p.x)).toEqual([-10, -5, 0, 5, 10]);
    expect(pos.every(p => p.y === 0 && p.tiltDeg === 0)).toBe(true);
  });

  it('β=0: N=1 單支在原點', () => {
    const pos = speakerPositions(1, 5, 0);
    expect(pos).toHaveLength(1);
    expect(pos[0]).toEqual({ x: 0, y: 0, tiltDeg: 0 });
  });

  it('β≠0: 座標對照真執行原軟體 draw_diagram 的 ground truth(y 是負值,喇叭往後彎遠離觀眾席)', () => {
    const pos = speakerPositions(N, S, BETA);
    expect(pos).toHaveLength(5);
    expect(pos[2].x).toBeCloseTo(0, 9);
    expect(pos[2].y).toBeCloseTo(0, 9);
    expect(pos[3].x).toBeCloseTo(4.932642440380708, 9);
    expect(pos[3].y).toBeCloseTo(-0.8179477705544883, 9);
    expect(pos[4].x).toBeCloseTo(9.337264405178159, 9);
    expect(pos[4].y).toBeCloseTo(-3.1842329070551245, 9);
    expect(pos[1].x).toBeCloseTo(-4.932642440380708, 9);
    expect(pos[1].y).toBeCloseTo(-0.8179477705544883, 9);
    expect(pos[0].x).toBeCloseTo(-9.337264405178159, 9);
    expect(pos[0].y).toBeCloseTo(-3.1842329070551245, 9);
  });

  it('β≠0: tiltDeg 線性遞增', () => {
    const pos = speakerPositions(5, 5, 18.8);
    for (let i = 0; i < 5; i++) {
      const k = i - 2;
      expect(pos[i].tiltDeg).toBeCloseTo(k * 18.8, 10);
    }
  });
});

describe('getArcInfo', () => {
  it('β=0 回傳 null', () => {
    expect(getArcInfo(5, 0)).toBeNull();
  });

  it('β≠0 回傳正確 R 和 betaRad', () => {
    const arc = getArcInfo(5, 18.8);
    expect(arc).not.toBeNull();
    const betaRad = (18.8 * Math.PI) / 180;
    expect(arc!.betaRad).toBeCloseTo(betaRad, 10);
    expect(arc!.R).toBeCloseTo(5 / (2 * Math.sin(betaRad / 2)), 10);
  });
});

describe('depthMarker', () => {
  it('dist 非正數或非有限值回傳 null', () => {
    expect(depthMarker(N, S, BETA, PHI, 0)).toBeNull();
    expect(depthMarker(N, S, BETA, PHI, -1)).toBeNull();
    expect(depthMarker(N, S, BETA, PHI, Infinity)).toBeNull();
    expect(depthMarker(N, S, BETA, PHI, NaN)).toBeNull();
  });

  it('β=0: 退化為有限寬度的水平線(depth=dist·cos(φ/2),不是貫穿全畫布)', () => {
    const dist = 3.5;
    const m = depthMarker(4, 7.1, 0, 90, dist);
    expect(m).not.toBeNull();
    if (m?.kind !== 'line') throw new Error('expected line');
    const expectedDepth = dist * Math.cos((90 / 2) * Math.PI / 180);
    const expectedHalf = ((4 - 1) * 7.1) / 2 + dist * Math.sin((90 / 2) * Math.PI / 180);
    expect(m.y1).toBeCloseTo(expectedDepth, 10);
    expect(m.y2).toBeCloseTo(expectedDepth, 10);
    expect(m.x1).toBeCloseTo(-expectedHalf, 10);
    expect(m.x2).toBeCloseTo(expectedHalf, 10);
  });

  it('β≠0: gap arc(dist=D_unity)對照 ground truth——圓心 (0,-R),半徑與端點座標', () => {
    const m = depthMarker(N, S, BETA, PHI, D_UNITY);
    expect(m).not.toBeNull();
    if (m?.kind !== 'arc') throw new Error('expected arc');
    expect(m.cx).toBe(0);
    expect(m.cy).toBeCloseTo(-R, 9);
    expect(m.r).toBeCloseTo(17.52576544751694, 6);
    // apex (t=0.5, angle 0) 世界座標
    const apexAng = (m.angStartRad + m.angEndRad) / 2;
    const apexX = m.cx + m.r * Math.sin(apexAng);
    const apexY = m.cy + m.r * Math.cos(apexAng);
    expect(apexX).toBeCloseTo(0, 6);
    expect(apexY).toBeCloseTo(2.2436160854296308, 6);
    // 端點世界座標(左右對稱)
    const p0x = m.cx + m.r * Math.sin(m.angStartRad);
    const p0y = m.cy + m.r * Math.cos(m.angStartRad);
    const p1x = m.cx + m.r * Math.sin(m.angEndRad);
    const p1y = m.cy + m.r * Math.cos(m.angEndRad);
    expect(p0x).toBeCloseTo(-12.83348971806081, 6);
    expect(p0y).toBeCloseTo(-3.346740019387491, 6);
    expect(p1x).toBeCloseTo(12.83348971806081, 6);
    expect(p1y).toBeCloseTo(-3.346740019387491, 6);
  });

  it('β≠0: limit arc(dist=d_max raw)對照 ground truth', () => {
    const m = depthMarker(N, S, BETA, PHI, D_MAX);
    expect(m).not.toBeNull();
    if (m?.kind !== 'arc') throw new Error('expected arc');
    expect(m.cy).toBeCloseTo(-R, 9);
    expect(m.r).toBeCloseTo(21.21136495549563, 6);
    const apexAng = (m.angStartRad + m.angEndRad) / 2;
    const apexY = m.cy + m.r * Math.cos(apexAng);
    expect(apexY).toBeCloseTo(5.929215593408321, 6);
    const p0x = m.cx + m.r * Math.sin(m.angStartRad);
    const p0y = m.cy + m.r * Math.cos(m.angStartRad);
    expect(p0x).toBeCloseTo(-17.68619134537083, 6);
    expect(p0y).toBeCloseTo(-3.572297143969518, 6);
  });

  it('N>=2 required is implicit via caller; single speaker still returns a degenerate arc/line', () => {
    // make_arc_points 本身對 N=1 沒有特殊 guard(N>=2 的限制是 draw_diagram 呼叫端另外加的),
    // 這裡只驗證函式本身不會丟例外。
    expect(() => depthMarker(1, 5, 18.8, 110, 3.5)).not.toThrow();
  });
});

describe('unityDots(ground truth:真執行 draw_diagram 的 oval 座標)', () => {
  it('每支喇叭 2 個點,共 2N 個', () => {
    expect(unityDots(N, S, BETA, PHI, D_UNITY)).toHaveLength(2 * N);
    expect(unityDots(N, S, BETA, PHI, Infinity)).toHaveLength(0);
    expect(unityDots(N, S, BETA, PHI, 0)).toHaveLength(0);
  });

  it('中央喇叭的左右點對照 ground truth', () => {
    const dots = unityDots(N, S, BETA, PHI, D_UNITY);
    // 中央喇叭是 index 2,其兩點在 dots[4]/dots[5]
    expect(dots[4].x).toBeCloseTo(-2.8670321550114712, 9);
    expect(dots[4].y).toBeCloseTo(2.007517527228661, 9);
    expect(dots[5].x).toBeCloseTo(2.8670321550114712, 9);
    expect(dots[5].y).toBeCloseTo(2.007517527228661, 9);
  });

  it('最外側喇叭的外側點恰好落在 gap arc 端點(自洽性)', () => {
    const dots = unityDots(N, S, BETA, PHI, D_UNITY);
    expect(dots[9].x).toBeCloseTo(12.833489718060811, 9);
    expect(dots[9].y).toBeCloseTo(-3.3467400193874894, 9);
  });

  it('相鄰喇叭的相向點在 unity 深度精確交會(unity 的定義)', () => {
    const dots = unityDots(N, S, BETA, PHI, D_UNITY);
    // 喇叭 2 的右點(dots[5])≡ 喇叭 3 的左點(dots[6])
    expect(dots[5].x).toBeCloseTo(dots[6].x, 9);
    expect(dots[5].y).toBeCloseTo(dots[6].y, 9);
  });
});

describe('unityRays(ground truth:發射端選擇 + 沿射線距離)', () => {
  it('N 奇數:中央 1 支發 2 條', () => {
    const rays = unityRays(5, S, BETA, PHI);
    expect(rays).toHaveLength(2);
    expect(rays[0].x).toBeCloseTo(0, 9);
    expect(rays[0].y).toBeCloseTo(0, 9);
    expect(rays[0].angleRad).toBeCloseTo(-(PHI / 2) * Math.PI / 180, 9);
    expect(rays[1].angleRad).toBeCloseTo((PHI / 2) * Math.PI / 180, 9);
  });

  it('N 偶數:中央 2 支(N/2-1, N/2)各發 2 條,共 4 條', () => {
    const rays = unityRays(4, S, BETA, PHI);
    expect(rays).toHaveLength(4);
    const pos = speakerPositions(4, S, BETA);
    expect(rays[0].x).toBeCloseTo(pos[1].x, 9);
    expect(rays[0].y).toBeCloseTo(pos[1].y, 9);
    expect(rays[2].x).toBeCloseTo(pos[2].x, 9);
    // 各自的角度含自己的 tilt
    const tilt1 = (pos[1].tiltDeg * Math.PI) / 180;
    expect(rays[0].angleRad).toBeCloseTo(tilt1 - (PHI / 2) * Math.PI / 180, 9);
  });

  it('沿射線走 limitDepth 的端點對照 ground truth 灰段終點', () => {
    const rays = unityRays(5, S, BETA, PHI);
    const r = rays[1]; // 中央喇叭 +φ/2
    const ex = r.x + D_MAX * Math.sin(r.angleRad);
    const ey = r.y + D_MAX * Math.cos(r.angleRad);
    expect(ex).toBeCloseTo(6.8464243162972975, 6);
    expect(ey).toBeCloseTo(4.793917916053625, 6);
  });
});

describe('minArrowDepthM + val_max 閉合式(ground truth:Min/Max 垂直箭頭轉折深度)', () => {
  it('β=0:= unityDist·cos(φ/2)(等於 val_min)', () => {
    const v = minArrowDepthM(7.1, 0, 90, 5.020458146424487);
    expect(v).toBeCloseTo(5.020458146424487 * Math.cos(Math.PI / 4), 9);
  });

  it('β≠0:gap arc 弧頂深度,對照 ground truth 2.2436(≠ val_min 2.4495——標籤與箭頭終點脫鉤是原軟體行為)', () => {
    const v = minArrowDepthM(S, BETA, PHI, D_UNITY);
    expect(v).toBeCloseTo(2.2436160854296343, 6);
    const { valMin } = calcProjectedRange(S, BETA, PHI, D_UNITY);
    expect(valMin).toBeCloseTo(2.449489742783178, 6);
    expect(Math.abs(v - valMin)).toBeGreaterThan(0.1);
  });

  it('val_max 閉合式 = draw_diagram 的 limit arc 弧頂(取代舊插值表)', () => {
    const { valMax } = calcProjectedRange(S, BETA, PHI, D_UNITY);
    expect(valMax).toBeCloseTo(5.929215593408321, 9);
  });
});
