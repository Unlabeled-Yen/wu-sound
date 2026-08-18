'use client';

// 陣列覆蓋幾何示意圖(俯視)+ 畫布互動引擎(縮放/平移/量測/圖層開關/座標懸浮)。
// 幾何邏輯對齊 develop/uncoupled-array-mcp/src/render_svg.py;互動邏輯對照原
// Uncoupled Array Designer v1.7 的 do_zoom/do_pan/toggle_measure/screen_to_phys
// (見 docs/array-designer/spec-v1.md §4)。

import { useEffect, useId, useRef, useState } from 'react';
import { speakerPositions, depthMarker, unityDots, unityRays, minArrowDepthM } from '@/lib/array-designer';

// 圖表數字沿用頁面既有字體(Noto Sans TC/PingFang TC),不另外載 Inter——
// 系統沒有第二套字型;數字對齊靠 tabular-nums,不靠換字型。

// 標線語意色對照原 app 截圖重新校準:Aud/Min/Max/Unity 保留語意色(降飽和),
// 覆蓋錐原軟體是單色灰線(不是藍色實心)——見 2026-07-28 對照原 app 截圖的視覺
// 稽核,COLOR.coverage 改灰。網格線用 lifeflat DARK.grid。
const COLOR = {
  grid: '#2E2D29',
  audience: '#a068d5', // 原 #a855f7 降飽和
  // 2026-07-29 修正:先前這裡寫「原軟體是橙色不是紅色」是錯的判斷(肉眼比對
  // 截圖誤判)。使用者提供的原軟體實機截圖證實 Min/Max 垂直箭頭+標籤+背景參考
  // 弧線是同一個紅色(bytecode 裡也確實是同一個 fill key 'result',不是分成
  // 兩個 key)。跟 shared.tsx LEGEND_ITEMS 的 Min/Max 紅色(#e07a7a,--nm-danger
  // 家族)統一成同一個值,避免圖例跟畫布顏色對不上。
  minMax: '#e07a7a',
  unity: '#b39330', // 原 #eab308 降飽和
  coverage: '#6b7280', // 原軟體是灰線,不是藍色(對照截圖修正)
  limit: '#8b8f98', // Limit 標線,原軟體是灰色
  measure: '#3db2c4', // 原 #22d3ee 降飽和
  angleLabel: '#71a0da', // 原 #60a5fa 降飽和
  ink: '#F0EFEB', // lifeflat DARK.ink,喇叭符號主色
  muted: '#8F8E88', // lifeflat DARK.muted,座標次要文字
  centerLine: '#3a3f47', // 喇叭中心虛線,淡灰
  axis: '#e5e7eb', // X/Y 主軸線與刻度數字,比一般網格線亮/粗,對照原軟體十字準線
};

// 併頁(16-acoustic-merged.md §2)的精簡示意圖只換 3 個顏色常數——扇形填色/
// 邊線、喇叭方塊。幾何運算(角度/重疊/Unity/Limit)完全不動,summary 模式只是
// 換一種畫法(拿掉工具列/格線/座標/角度/縮放平移),不是重算。
const SUMMARY_COLOR = {
  fanFill: 'rgba(111,192,232,.1)',
  fanStroke: 'rgba(111,192,232,.34)',
  speakerBlock: 'rgba(143,208,238,.72)',
};

interface Props {
  quantity: number;
  spacingM: number;
  coverageDeg: number;
  betaDeg?: number; // splay 張角,預設 0(平行軸)
  audienceDistM: number;
  depthLabel?: string; // 參考深度線的標籤(不同分頁語意不同,如「觀眾席」「Target Unity」)
  coverageWidth3dbM: number;
  rangeMinM: number | null;
  rangeMaxM: number | null;
  unityDistM: number;
  // 原軟體畫布上的 "Limit"(Overlap Limit Arc)。原軟體畫的是弧線,這裡先用
  // 水平標線呈現正確的深度數值(弧線幾何需要更多逆向工程,見
  // docs/array-designer/spec-v1.md §6,標為已知簡化,非最終形狀)。
  limitDepthM?: number;
  // full(預設)= 現有的技術分析畫布(格線/座標/角度/縮放平移/量尺,五個分頁
  // 各自的求解結果頁用這個)。summary = 帳務併頁(16-acoustic-merged.md)的
  // 精簡版:固定視角、只留扇形+喇叭方塊+觀眾席線,填滿 1376×424 的扁寬版位。
  // 兩種模式共用同一套 speakerPositions/px 幾何,只是 summary 拿掉互動與雜訊圖層。
  variant?: 'full' | 'summary';
}

interface Point {
  x: number;
  y: number;
}

const ZOOM_MIN = 0.2;
const ZOOM_MAX = 20;
const ZOOM_STEP = 1.15;

export default function ArrayCoverageDiagram({
  quantity: N,
  spacingM: S,
  coverageDeg: phi,
  betaDeg = 0,
  audienceDistM,
  depthLabel = '觀眾席',
  coverageWidth3dbM: covW,
  rangeMinM,
  rangeMaxM,
  unityDistM,
  limitDepthM,
  variant = 'full',
}: Props) {
  const isSummary = variant === 'summary';

  // summary 的投影畫布要用「容器實際量到的尺寸」,不能寫死設計稿的 1376×424。
  // 寫死的後果:那組數字假設版位是 3.2:1 的扁寬條,但實際容器(側欄擠壓後)是
  // 1.2:1,等比縮放時整張圖被縮到 ~50% 並上下各留一大塊空白——形狀沒歪,但圖
  // 只用到 37% 的可用高度,12px 的標籤字實縮成 6px 完全看不清。
  // 讓 viewBox 等於容器實際大小,SVG 單位就等於 CSS px:不留白、字級如實。
  const summaryBoxRef = useRef<HTMLDivElement>(null);
  const [summaryBox, setSummaryBox] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = summaryBoxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSummaryBox({ w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isSummary]);

  // SSR 與 client 首次 render 都用這組 fallback,兩邊一致才不會 hydration mismatch;
  // ResizeObserver 量到真值後才觸發第二次 render。
  const WIDTH_PX = isSummary ? (summaryBox?.w ?? 1376) : 560;
  const HEIGHT_PX = isSummary ? (summaryBox?.h ?? 424) : 420;

  // SVG <pattern> id 要在頁面內唯一——5 個分頁同時掛載(WBS-B 的 display:none
  // 持久化設計),若用固定字串會 5 個 <svg> 搶同一個 id,網格可能對錯分頁。
  const patternId = `grid-${useId()}`;

  const svgRef = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const dragRef = useRef<{ startSvg: Point; startPan: Point } | null>(null);

  // 圖層開關對照原軟體 show_grid/show_lines/show_coords/show_angles/show_coverage
  // 五個布林變數,用非退化參數(N=4,S=7.1,φ=90)重跑 draw_diagram 並逐一關閉每個
  // 開關 diff 真實 canvas 呼叫,得到的分組(不是憑直覺分的,原本猜錯):
  //   grid     → 網格 pattern + X/Y 十字軸線 + 刻度數字(同一開關,不是分開的)
  //   lines    → 觀眾席線、Min/Max 水平參考線、Min/Max 垂直箭頭+標籤
  //   coords   → 每支喇叭下方的 (x,y) 座標文字(原本誤標成獨立的「X,Y」開關)
  //   angles   → 每支喇叭上方的角度文字
  //   coverage → 覆蓋錐(邊線+中心虛線)、Min 深度點、Unity/Limit 射線+標籤
  const [layers, setLayers] = useState({ grid: true, lines: true, coords: true, angles: true, coverage: true });
  const [measureActive, setMeasureActive] = useState(false);
  const [measurePoints, setMeasurePoints] = useState<Point[]>([]); // 世界座標(m)
  const [hoverWorld, setHoverWorld] = useState<Point | null>(null);

  // Range 顯示投影(理論上恆有值,見 lib/array-designer.ts calcProjectedRange)。
  const dMin = rangeMinM ?? audienceDistM;
  const dMax = rangeMaxM ?? audienceDistM * 2;

  const positions = speakerPositions(N, S, betaDeg);
  const half = phi / 2;
  const arrayExtentX = positions.length > 0 ? Math.max(...positions.map(p => Math.abs(p.x))) : 0;
  // β≠0 時喇叭 y 是負值(往後彎、遠離觀眾席),要算的是「往後彎多遠」(絕對值),
  // 不是最大值(那樣會抓到接近 0 的中央喇叭,漏掉真正外擴的兩側)。
  const arrayExtentY = positions.length > 0 ? Math.abs(Math.min(0, ...positions.map(p => p.y))) : 0;

  const worldW = Math.max(covW * 1.15, arrayExtentX * 2 + 2 * audienceDistM * 1.1, 10);
  const worldH = Math.max((dMax + arrayExtentY) * 1.3, audienceDistM * 1.8, 5);

  const sx = WIDTH_PX / worldW;
  const sy = HEIGHT_PX / worldH;
  const scale = Math.min(sx, sy);
  const ox = WIDTH_PX / 2;
  // summary 把畫出來的世界範圍垂直置中,不是釘在固定比例位置。
  //
  // 俯視圖的 X/Y 必須同一個 scale(拉伸任一軸,角度就是假的),所以世界寬高比
  // 跟容器寬高比不同時,一定有一軸用不滿——差別只在那塊空白留在哪。原本
  // 寫死 22%(來自 21a 原型 y=93/424 的扁寬版位),容器一變高就把整張圖擠在
  // 上緣、下方空一大片。置中後不論容器什麼比例,圖都在視覺重心上。
  // 上緣保留 44px 給「覆蓋示意(俯視)」標題,不讓喇叭方塊壓到字。
  const TITLE_INSET_PX = 44;
  // 真正畫到的最深處,不是 dMax——扇形底邊兩角在 dMax*cos(半角±傾角),半角 45°
  // 時只有 dMax 的 0.71 倍。拿 dMax 當繪製範圍會高估,置中就會偏上。
  const halfRad = (a: number) => (a * Math.PI) / 180;
  const drawnMaxY = Math.max(
    audienceDistM, // 觀眾席線也要算進來,它可能比扇形更深
    ...positions.flatMap((s) => [
      s.y + dMax * Math.cos(halfRad(-half + s.tiltDeg)),
      s.y + dMax * Math.cos(halfRad(half + s.tiltDeg)),
    ]),
  );
  const oy = isSummary
    ? Math.max(TITLE_INSET_PX, (HEIGHT_PX - (drawnMaxY + arrayExtentY) * scale) / 2) + arrayExtentY * scale
    : 84;

  // 四捨五入到 3 位小數:server/client 的 Math.sin/cos 末位可能有 ULP 級差異,
  // 直接把完整浮點數塞進 SVG 屬性會觸發 React hydration mismatch。
  function round3(v: number): number {
    return Math.round(v * 1000) / 1000;
  }

  // world(公尺) -> content 座標(套用 zoom/pan 前,即 <g> 內部座標系)
  function px(x: number, y: number): Point {
    return { x: round3(ox + x * scale), y: round3(oy + y * scale) };
  }

  // content 座標 -> world(公尺),px() 的反函式
  function contentToWorld(local: Point): Point {
    return { x: (local.x - ox) / scale, y: (local.y - oy) / scale };
  }

  // 螢幕(client)座標 -> SVG viewBox 座標(套用 <g> 的 zoom/pan 之前),用
  // getScreenCTM 換算,不受畫布實際顯示尺寸與 viewBox 比例不同影響。
  function clientToSvgSpace(clientX: number, clientY: number): Point {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }

  // SVG viewBox 座標 -> content 座標(反推 <g> 的 translate(pan) scale(zoom))
  function svgSpaceToContent(svgP: Point): Point {
    return { x: (svgP.x - pan.x) / zoom, y: (svgP.y - pan.y) / zoom };
  }

  // 目前可視範圍對應的世界座標邊界,隨 zoom/pan 即時變化——軸刻度數字要
  // 顯示在「現在看得到的範圍」,不是畫布初始的靜態範圍。
  function getVisibleWorldBounds() {
    const c0 = contentToWorld(svgSpaceToContent({ x: 0, y: 0 }));
    const c1 = contentToWorld(svgSpaceToContent({ x: WIDTH_PX, y: HEIGHT_PX }));
    return {
      xMin: Math.min(c0.x, c1.x), xMax: Math.max(c0.x, c1.x),
      yMin: Math.min(c0.y, c1.y), yMax: Math.max(c0.y, c1.y),
    };
  }

  function onWheel(e: React.WheelEvent<SVGSVGElement>) {
    e.preventDefault();
    const svgP = clientToSvgSpace(e.clientX, e.clientY);
    const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    const newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom * factor));
    // 以鼠標所在的 content 座標為錨點縮放,錨點在畫面上的位置縮放前後不變。
    const local = svgSpaceToContent(svgP);
    setZoom(newZoom);
    setPan({ x: svgP.x - local.x * newZoom, y: svgP.y - local.y * newZoom });
  }

  function onMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    const svgP = clientToSvgSpace(e.clientX, e.clientY);
    if (measureActive) {
      const world = contentToWorld(svgSpaceToContent(svgP));
      setMeasurePoints((pts) => (pts.length >= 2 ? [world] : [...pts, world]));
      return;
    }
    dragRef.current = { startSvg: svgP, startPan: pan };
  }

  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const svgP = clientToSvgSpace(e.clientX, e.clientY);
    setHoverWorld(contentToWorld(svgSpaceToContent(svgP)));
    if (dragRef.current) {
      const { startSvg, startPan } = dragRef.current;
      setPan({ x: startPan.x + (svgP.x - startSvg.x), y: startPan.y + (svgP.y - startSvg.y) });
    }
  }

  function onMouseUp() {
    dragRef.current = null;
  }

  function onMouseLeave() {
    dragRef.current = null;
    setHoverWorld(null);
  }

  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  function toggleMeasure() {
    setMeasureActive((v) => !v);
    setMeasurePoints([]);
  }

  function toggleLayer(key: keyof typeof layers) {
    setLayers((l) => ({ ...l, [key]: !l[key] }));
  }

  // 網格用 SVG <pattern> 平鋪,不是算好的固定線段——固定線段只夠蓋 zoom=1 時的
  // 畫布,縮小(zoom<1)看到更大範圍時線段撐不到邊界,外圍就空了(User 回報的問題)。
  // pattern 平鋪一個大到「不管怎麼縮放平移都蓋得住」的矩形,由 <g> 的
  // scale(zoom) 一起帶動縮放,永遠貼齊世界座標,真正無限延伸。
  // ground truth 軸刻度固定是 5m 一格(-20,-15,...,20),不是動態步進——動態
  // 步進是 Wu 自己的猜測,對照真值後改回固定值。
  const gridStep = 5;
  const gridStepPx = gridStep * scale;
  // ZOOM_MIN=0.2(縮小 5x),BIG 要夠涵蓋縮到最小時的可視範圍,留大量餘裕。
  const GRID_BIG = Math.max(WIDTH_PX, HEIGHT_PX) * 20;

  const measureDistM =
    measurePoints.length === 2
      ? Math.hypot(measurePoints[1].x - measurePoints[0].x, measurePoints[1].y - measurePoints[0].y)
      : null;

  const LAYER_LABEL: Record<keyof typeof layers, string> = {
    grid: 'Grid', lines: 'Lines', coords: 'Coords', angles: 'Angles', coverage: 'Coverage',
  };

  // 精簡示意圖(16-acoustic-merged.md §4-2):固定視角,不接 zoom/pan/measure——
  // 這是答案帶的一部分,不是互動分析工具。扇形+喇叭方塊+觀眾席線用同一套
  // speakerPositions/px 幾何,只是拿掉格線/座標/角度/Min·Max·Unity·Limit 標線
  // (那些留在深度軸,不在示意圖裡重複)。
  if (isSummary) {
    const coneDepth = dMax;
    const audLine0 = px(-worldW / 2, audienceDistM);
    const audLine1 = px(worldW / 2, audienceDistM);
    const speakerW = 26, speakerH = 15;

    return (
      <div ref={summaryBoxRef} className="relative w-full h-full" data-diagram>
        <span
          className="absolute left-3.5 top-3 uppercase"
          style={{ font: '400 10px/1 "Noto Sans TC",sans-serif', letterSpacing: '.16em', color: 'var(--nm-text-muted)' }}
        >
          覆蓋示意(俯視)
        </span>
        {/*
          preserveAspectRatio 一定要是 xMidYMid meet(等比縮放,置中留白),
          不能是 none——WIDTH_PX×HEIGHT_PX(1376×424)是設計稿假設的畫布尺寸,
          但實際容器常常拿不到這個寬高比(側欄擠壓、視窗變化)。用 none 會讓
          瀏覽器把座標系統「硬拉」進不同比例的容器,X/Y 各自套不同縮放倍率,
          扇形三角形因此整個變形走樣,不是單純「畫面比較小」而已。
        */}
        <svg viewBox={`0 0 ${WIDTH_PX} ${HEIGHT_PX}`} preserveAspectRatio="xMidYMid meet" className="absolute inset-0 w-full h-full block">
          <g fill={SUMMARY_COLOR.fanFill} stroke={SUMMARY_COLOR.fanStroke} strokeWidth={1}>
            {positions.map((s, i) => {
              const leftAngle = -half + s.tiltDeg;
              const rightAngle = half + s.tiltDeg;
              const p0 = px(s.x, s.y);
              const pLeft = px(s.x + coneDepth * Math.sin((leftAngle * Math.PI) / 180), s.y + coneDepth * Math.cos((leftAngle * Math.PI) / 180));
              const pRight = px(s.x + coneDepth * Math.sin((rightAngle * Math.PI) / 180), s.y + coneDepth * Math.cos((rightAngle * Math.PI) / 180));
              return <polygon key={`fan-${i}`} points={`${p0.x},${p0.y} ${pLeft.x},${pLeft.y} ${pRight.x},${pRight.y}`} />;
            })}
          </g>
          {positions.map((s, i) => {
            const c = px(s.x, s.y);
            return (
              <rect
                key={`spk-${i}`}
                x={c.x - speakerW / 2}
                y={c.y - speakerH / 2}
                width={speakerW}
                height={speakerH}
                rx={2}
                fill={SUMMARY_COLOR.speakerBlock}
                transform={s.tiltDeg !== 0 ? `rotate(${-s.tiltDeg} ${c.x} ${c.y})` : undefined}
              />
            );
          })}
          <line x1={audLine0.x} y1={audLine0.y} x2={audLine1.x} y2={audLine1.y} stroke="rgba(160,104,213,.65)" strokeWidth={2} />
          {/*
            標籤畫在 SVG 座標系裡面(不是外層疊一個 HTML <span>)——之前那版
            直接把 0~1376 的 viewBox 數值當 CSS px 用在 position:absolute 上,
            但容器實際沒有 1376px 寬,標籤位置對不上圖形,容器又是
            overflow:hidden,數值大一點整個被裁掉看不到。畫在 SVG 裡面就
            跟其他圖形共用同一套座標轉換,永遠對得上,不管容器縮放多少。
          */}
          <text
            x={audLine0.x + 6}
            y={audLine0.y + 16}
            fill="#c39ae8"
            style={{ font: '400 12px/1 ui-monospace,SFMono-Regular,Menlo,monospace' }}
          >
            {depthLabel} {audienceDistM.toFixed(1)}m
          </text>
        </svg>
        <div
          className="absolute left-3.5 bottom-3 max-w-[70%]"
          style={{ font: '400 10.5px/1.6 "Noto Sans TC",sans-serif', color: 'var(--nm-text-faint)' }}
        >
          此為自由場等腰弧列幾何理論值,未計入場地反射、器材規格誤差等現場變因,實際佈點仍需現場覆核。
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* 工具列:圖層開關 + 量測 + 重置視圖 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px]" style={{ color: 'var(--nm-text-secondary)' }}>
        {(Object.keys(layers) as (keyof typeof layers)[]).map((key) => (
          <label key={key} className="flex items-center gap-1.5 cursor-pointer select-none">
            <input type="checkbox" checked={layers[key]} onChange={() => toggleLayer(key)} className="cursor-pointer" />
            {LAYER_LABEL[key]}
          </label>
        ))}
        <div className="flex-1" />
        <button
          type="button"
          onClick={toggleMeasure}
          className="nm-btn text-[12px]"
          style={{ minHeight: 'auto', padding: '4px 10px', ...(measureActive ? { color: 'var(--nm-text-primary)', borderColor: 'rgba(255,255,255,0.4)' } : {}) }}
        >
          📏 Ruler
        </button>
        <button type="button" onClick={resetView} className="nm-btn text-[12px]" style={{ minHeight: 'auto', padding: '4px 10px' }}>
          Reset View
        </button>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH_PX} ${HEIGHT_PX}`}
        className="w-full rounded-xl touch-none tabular"
        style={{ background: '#0e1116', cursor: measureActive ? 'crosshair' : dragRef.current ? 'grabbing' : 'grab' }}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
      >
        <defs>
          <pattern id={patternId} x={ox} y={oy} width={gridStepPx} height={gridStepPx} patternUnits="userSpaceOnUse">
            <path
              d={`M ${gridStepPx} 0 L 0 0 0 ${gridStepPx}`}
              fill="none"
              stroke={COLOR.grid}
              strokeWidth={0.5 / zoom}
            />
          </pattern>
        </defs>
        <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
          {/* 網格:pattern 平鋪一個超大矩形,貼齊世界座標,縮放平移都蓋得住整個可視範圍。 */}
          {layers.grid && (
            <rect x={ox - GRID_BIG} y={oy - GRID_BIG} width={GRID_BIG * 2} height={GRID_BIG * 2} fill={`url(#${patternId})`} />
          )}

          {/* X/Y 主軸(十字準線),對照原軟體。ground truth 證實這跟網格 pattern
              是同一個開關(show_grid),不是獨立的「X,Y」開關——之前拆成兩個是
              猜錯的。刻度數字改到畫布邊界渲染(見下方 <g> 外的區塊),不跟著
              十字準線跑,對照原軟體「數字貼邊、線在中間」的排版。 */}
          {layers.grid && (() => {
            const b = getVisibleWorldBounds();
            const xAxisL = px(b.xMin, 0), xAxisR = px(b.xMax, 0);
            const yAxisT = px(0, b.yMin), yAxisB = px(0, b.yMax);
            return (
              <g>
                <line x1={xAxisL.x} y1={xAxisL.y} x2={xAxisR.x} y2={xAxisR.y} stroke={COLOR.axis} strokeWidth={1 / zoom} strokeOpacity={0.5} />
                <line x1={yAxisT.x} y1={yAxisT.y} x2={yAxisB.x} y2={yAxisB.y} stroke={COLOR.axis} strokeWidth={1 / zoom} strokeOpacity={0.5} />
                <text x={xAxisR.x - 4 / zoom} y={xAxisR.y - 6 / zoom} fill={COLOR.axis} fontSize={10 / zoom} textAnchor="end">X</text>
                <text x={yAxisT.x + 4 / zoom} y={yAxisT.y + 10 / zoom} fill={COLOR.axis} fontSize={10 / zoom}>Y</text>
              </g>
            );
          })()}

          {/* 覆蓋錐(依 betaDeg 傾斜)——原軟體是細灰線,不是藍色實心。長度只畫到
              dMax(跟灰色 Limit 射線段/水平 Max 線同一深度),不是 limitDepthM。
              ground truth 證實錐邊線+中心虛線+Min 深度點+Unity/Limit 射線全部
              歸同一個開關 show_coverage(原本 Wu 拆成 Lines/Coverage 兩個控制,
              且填色 polygon 是 Wu 自己加的裝飾,原軟體沒有填色,不影響功能予以保留)。 */}
          {layers.coverage && (() => {
            const coneDepth = dMax;
            return positions.map((s, i) => {
              const leftAngle = -half + s.tiltDeg;
              const rightAngle = half + s.tiltDeg;
              const p0 = px(s.x, s.y);
              const pLeft = px(s.x + coneDepth * Math.sin((leftAngle * Math.PI) / 180), s.y + coneDepth * Math.cos((leftAngle * Math.PI) / 180));
              const pRight = px(s.x + coneDepth * Math.sin((rightAngle * Math.PI) / 180), s.y + coneDepth * Math.cos((rightAngle * Math.PI) / 180));
              return (
                <g key={`cone-${i}`}>
                  <line x1={p0.x} y1={p0.y} x2={pLeft.x} y2={pLeft.y} stroke={COLOR.coverage} strokeOpacity={0.5} strokeWidth={1 / zoom} />
                  <line x1={p0.x} y1={p0.y} x2={pRight.x} y2={pRight.y} stroke={COLOR.coverage} strokeOpacity={0.5} strokeWidth={1 / zoom} />
                  <polygon points={`${p0.x},${p0.y} ${pLeft.x},${pLeft.y} ${pRight.x},${pRight.y}`} fill={COLOR.coverage} fillOpacity={0.08} />
                </g>
              );
            });
          })()}

          {/* 喇叭中心垂直虛線(輔助對齊,對照原軟體,同屬 show_coverage 開關) */}
          {layers.coverage && positions.map((s, i) => {
            const p0 = px(s.x, s.y);
            const depth = limitDepthM ?? dMax;
            const tiltRad = (s.tiltDeg * Math.PI) / 180;
            const p1 = px(s.x + depth * Math.sin(tiltRad), s.y + depth * Math.cos(tiltRad));
            return (
              <line key={`cl-${i}`} x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke={COLOR.centerLine} strokeWidth={0.5 / zoom} strokeDasharray="2,3" />
            );
          })}

          {/* 喇叭符號(梯形,對照原軟體實體喇叭圖示;隨 tiltDeg 旋轉)+ 座標/角度標籤。
              由上而下對照原軟體排版:角度 -> 座標 -> D間距標註 -> 喇叭本體。 */}
          {(() => {
            const topW = 6, botW = 10, hgt = 7;

            return (
              <>
                {positions.map((s, i) => {
                  const c = px(s.x, s.y);
                  const localTop = c.y - hgt;
                  const pathD = `M ${c.x - topW / 2} ${c.y - hgt} L ${c.x + topW / 2} ${c.y - hgt} L ${c.x + botW / 2} ${c.y} L ${c.x - botW / 2} ${c.y} Z`;
                  return (
                    <g key={`spk-${i}`}>
                      <path
                        d={pathD}
                        fill="none"
                        stroke={COLOR.ink}
                        strokeWidth={1 / zoom}
                        // SVG rotate(+θ) 對「預設朝下(寬邊朝 +y)」的梯形旋轉後,
                        // 朝向變成 (-sinθ, cosθ)——跟全檔案統一的喇叭朝向慣例
                        // (sinθ, cosθ)(覆蓋錐、中心虛線、Unity 射線都用這個)左右
                        // 鏡像相反,喇叭圖示會轉錯邊。用 -tiltDeg 修正方向。
                        transform={s.tiltDeg !== 0 ? `rotate(${-s.tiltDeg} ${c.x} ${c.y})` : undefined}
                      />
                      <circle cx={c.x} cy={c.y} r={1.5 / zoom} fill={COLOR.coverage} />
                      {layers.angles && (
                        <text x={c.x} y={localTop - 24} fill={COLOR.angleLabel} fontSize={9 / zoom} fontWeight={600} textAnchor="middle">
                          {s.tiltDeg.toFixed(1)}°
                        </text>
                      )}
                      {layers.coords && (
                        <text x={c.x} y={localTop - 12} fill={COLOR.muted} fontSize={8 / zoom} textAnchor="middle">
                          ({s.x.toFixed(1)}, {s.y.toFixed(1)})
                        </text>
                      )}
                    </g>
                  );
                })}

                {positions.length >= 2 && (() => {
                  let idxR = positions.findIndex((p) => p.x >= -1e-6);
                  if (idxR <= 0) idxR = 1;
                  const idxL = idxR - 1;
                  const pL = px(positions[idxL].x, positions[idxL].y);
                  const pR = px(positions[idxR].x, positions[idxR].y);
                  const dArrowY = Math.min(pL.y, pR.y) - hgt - 12;
                  const mx = (pL.x + pR.x) / 2;
                  const gap = 24 / zoom;
                  const ah = 3.5 / zoom;
                  return (
                    <g>
                      <line x1={pL.x} y1={dArrowY} x2={mx - gap} y2={dArrowY} stroke={COLOR.muted} strokeWidth={0.8 / zoom} />
                      <line x1={mx + gap} y1={dArrowY} x2={pR.x} y2={dArrowY} stroke={COLOR.muted} strokeWidth={0.8 / zoom} />
                      <polygon points={`${pL.x},${dArrowY} ${pL.x + ah * 1.6},${dArrowY - ah / 1.6} ${pL.x + ah * 1.6},${dArrowY + ah / 1.6}`} fill={COLOR.muted} />
                      <polygon points={`${pR.x},${dArrowY} ${pR.x - ah * 1.6},${dArrowY - ah / 1.6} ${pR.x - ah * 1.6},${dArrowY + ah / 1.6}`} fill={COLOR.muted} />
                      <text x={mx} y={dArrowY - 4 / zoom} fill={COLOR.muted} fontSize={9 / zoom} textAnchor="middle">
                        D = <tspan fontWeight={700}>{S.toFixed(1)}m</tspan>
                      </text>
                    </g>
                  );
                })()}
              </>
            );
          })()}

          {/* 參考深度線(紫)+ Min/Max 深度線/箭頭 + 觀眾席線,全部同屬原軟體的
              show_lines 開關(ground truth diff 證實這三組是綁在一起的,不是
              Wu 之前分散不受任何開關控制)。 */}
          {layers.lines && (() => {
            const p0 = px(-worldW / 2, audienceDistM);
            const p1 = px(worldW / 2, audienceDistM);
            return (
              <g>
                <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke={COLOR.audience} strokeWidth={1.4 / zoom} strokeDasharray="5,3" />
                <text x={p1.x - 6} y={p1.y - 4} fill={COLOR.audience} fontSize={11 / zoom} textAnchor="end">
                  {depthLabel} <tspan fontWeight={800}>{audienceDistM.toFixed(1)}m</tspan>
                </text>
              </g>
            );
          })()}

          {/* Min/Max 背景參考線(橙/灰)。這不是 val_min/val_max 那組垂直箭頭
              (下面那段才是),是原軟體 make_arc_points 畫的「最外側喇叭覆蓋錐
              邊線,在 unityDistM/limitDepthM 深度處的端點軌跡」——真執行原軟體
              bytecode 逐句反編譯取得公式,對照真實 canvas 座標驗證(誤差
              <0.01m,見 lib/array-designer.ts depthMarker 與其測試)。β=0 時是
              有限寬度的水平線,β≠0 時是圓弧(圓心跟喇叭弧共用同一焦點)。 */}
          {layers.lines && [
            { label: 'Min', dist: unityDistM, dash: '6,4', color: COLOR.minMax },
            { label: 'Max', dist: limitDepthM ?? NaN, dash: '4,4', color: COLOR.limit },
          ].map(({ label, dist, dash, color }) => {
            const marker = depthMarker(N, S, betaDeg, phi, dist);
            if (!marker) return null;
            if (marker.kind === 'line') {
              const p0 = px(marker.x1, marker.y1);
              const p1 = px(marker.x2, marker.y2);
              return (
                <line key={`${label}-line`} x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke={color} strokeWidth={0.75 / zoom} strokeDasharray={dash} strokeOpacity={0.55} />
              );
            }
            const STEPS = 48;
            const pts = Array.from({ length: STEPS + 1 }, (_, s) => {
              const t = s / STEPS;
              const ang = marker.angStartRad + t * (marker.angEndRad - marker.angStartRad);
              const wx = marker.cx + marker.r * Math.sin(ang);
              const wy = marker.cy + marker.r * Math.cos(ang);
              const p = px(wx, wy);
              return `${p.x},${p.y}`;
            }).join(' ');
            return (
              <polyline key={`${label}-arc`} points={pts} fill="none" stroke={color} strokeWidth={0.75 / zoom} strokeDasharray={dash} strokeOpacity={0.55} />
            );
          })}
          {/* Unity 深度圓點(黃)——每支喇叭沿覆蓋錐左右邊線走 unityDistM 的兩個
              點(相鄰喇叭的相向邊線在 unity 深度精確交會,重疊後視覺上 N+1 個)。
              公式逐句反編譯 draw_diagram 驗證,見 lib/array-designer.ts unityDots。
              歸屬 show_coverage 開關。 */}
          {layers.coverage && unityDots(N, S, betaDeg, phi, unityDistM).map((d, j) => {
            const p = px(d.x, d.y);
            return <circle key={`unitydot-${j}`} cx={p.x} cy={p.y} r={2 / zoom} fill={COLOR.unity} />;
          })}
          {layers.lines && (() => {
            // 箭頭轉折深度 ≠ 標籤數值(原軟體行為,逐句反編譯驗證):
            //   Min 段終點 = minArrowDepthM(β=0 時恰等於 val_min,β≠0 時是
            //   gap arc 弧頂深度);Max 段終點 = val_max(閉合式本身就是弧頂)。
            //   標籤仍顯示 val_min/val_max(dMin/dMax)。
            const minArrowY = minArrowDepthM(S, betaDeg, phi, unityDistM);
            const p0 = px(0, 0);
            const pMin = px(0, Number.isFinite(minArrowY) ? minArrowY : dMin);
            const pMax = px(0, dMax);
            const ah = 3 / zoom;
            const minLabelY = (p0.y + pMin.y) / 2;
            const maxLabelY = pMax.y + 10 / zoom;
            return (
              <g>
                {/* Min 段:陣列線(y=0)到 dMin,雙箭頭 */}
                <line x1={p0.x} y1={p0.y} x2={pMin.x} y2={pMin.y} stroke={COLOR.minMax} strokeWidth={1.2 / zoom} />
                <polygon points={`${p0.x},${p0.y} ${p0.x - ah / 1.6},${p0.y + ah * 1.6} ${p0.x + ah / 1.6},${p0.y + ah * 1.6}`} fill={COLOR.minMax} />
                <polygon points={`${pMin.x},${pMin.y} ${pMin.x - ah / 1.6},${pMin.y - ah * 1.6} ${pMin.x + ah / 1.6},${pMin.y - ah * 1.6}`} fill={COLOR.minMax} />
                <rect x={pMin.x - 25 / zoom} y={minLabelY - 7 / zoom} width={50 / zoom} height={14 / zoom} fill="#0e1116" />
                <text x={pMin.x} y={minLabelY + 3.5 / zoom} fill={COLOR.minMax} fontSize={10 / zoom} textAnchor="middle">
                  Min <tspan fontWeight={800}>{dMin.toFixed(1)}m</tspan>
                </text>
                {/* Max 段:接著 Min 段繼續畫到 dMax,單箭頭(不是從 0 重新開始) */}
                <line x1={pMin.x} y1={pMin.y} x2={pMax.x} y2={pMax.y} stroke={COLOR.minMax} strokeWidth={1.2 / zoom} />
                <polygon points={`${pMax.x},${pMax.y} ${pMax.x - ah / 1.6},${pMax.y - ah * 1.6} ${pMax.x + ah / 1.6},${pMax.y - ah * 1.6}`} fill={COLOR.minMax} />
                <rect x={pMax.x - 25 / zoom} y={maxLabelY - 7 / zoom} width={50 / zoom} height={14 / zoom} fill="#0e1116" />
                <text x={pMax.x} y={maxLabelY + 3.5 / zoom} fill={COLOR.minMax} fontSize={10 / zoom} textAnchor="middle">
                  Max <tspan fontWeight={800}>{dMax.toFixed(1)}m</tspan>
                </text>
              </g>
            );
          })()}

          {/* Unity/Limit 射線(黃→灰)。發射端與線段定義逐句反編譯 draw_diagram
              驗證(見 lib/array-designer.ts unityRays):N 奇 → 中央 1 支、
              N 偶 → 中央 2 支,每支沿自己覆蓋錐左右邊線(tilt±φ/2)各射一條。
              黃段 = 沿射線距離 0→unityDistM(原始 D_unity),灰段 =
              unityDistM→limitDepthM(原始 d_max)——是「沿射線的距離」,不是
              深度截距(先前用 (dMin−y)/cos(角度) 是錯的來源)。標籤只在最後
              一條射線上出現一次,值 = unityDistM/limitDepthM 原始物理量。 */}
          {layers.coverage && Number.isFinite(unityDistM) && unityDistM > 0 && (() => {
            const rays = unityRays(N, S, betaDeg, phi);
            const lim = limitDepthM !== undefined && Number.isFinite(limitDepthM) && limitDepthM > unityDistM ? limitDepthM : null;
            return rays.map((r, ri) => {
              const origin = px(r.x, r.y);
              const turnX = r.x + unityDistM * Math.sin(r.angleRad);
              const turnY = r.y + unityDistM * Math.cos(r.angleRad);
              const pTurn = px(turnX, turnY);
              const pEnd = lim !== null ? px(r.x + lim * Math.sin(r.angleRad), r.y + lim * Math.cos(r.angleRad)) : null;
              const showLabel = ri === rays.length - 1;
              return (
                <g key={`ul-${ri}`}>
                  <line x1={origin.x} y1={origin.y} x2={pTurn.x} y2={pTurn.y} stroke={COLOR.unity} strokeWidth={1.2 / zoom} strokeDasharray="4,3" />
                  {pEnd && (
                    <line x1={pTurn.x} y1={pTurn.y} x2={pEnd.x} y2={pEnd.y} stroke={COLOR.limit} strokeWidth={1.2 / zoom} strokeDasharray="4,3" />
                  )}
                  {showLabel && (
                    <>
                      <text x={pTurn.x + 4 / zoom} y={pTurn.y - 4 / zoom} fill={COLOR.unity} fontSize={10 / zoom}>
                        Unity <tspan fontWeight={800}>{unityDistM.toFixed(1)}m</tspan>
                      </text>
                      {pEnd && lim !== null && (
                        <text x={pEnd.x + 4 / zoom} y={pEnd.y - 4 / zoom} fill={COLOR.limit} fontSize={10 / zoom}>
                          Limit <tspan fontWeight={800}>{lim.toFixed(1)}m</tspan>
                        </text>
                      )}
                    </>
                  )}
                </g>
              );
            });
          })()}

          {/* 量測點與連線 */}
          {measurePoints.map((w, i) => {
            const p = px(w.x, w.y);
            return <circle key={`mp-${i}`} cx={p.x} cy={p.y} r={3.5 / zoom} fill={COLOR.measure} stroke="#0e1116" strokeWidth={1 / zoom} />;
          })}
          {measurePoints.length === 2 && (() => {
            const p0 = px(measurePoints[0].x, measurePoints[0].y);
            const p1 = px(measurePoints[1].x, measurePoints[1].y);
            const mx = (p0.x + p1.x) / 2;
            const my = (p0.y + p1.y) / 2;
            return (
              <g>
                <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke={COLOR.measure} strokeWidth={1.2 / zoom} strokeDasharray="2,2" />
                <text x={mx} y={my - 6} fill={COLOR.measure} fontSize={11 / zoom} textAnchor="middle" fontWeight={800}>
                  {measureDistM?.toFixed(2)} m
                </text>
              </g>
            );
          })()}
        </g>

        {/* X/Y 軸刻度數字——貼齊畫布邊界(對照原軟體「數字在邊界、線在中間」的
            排版,不是像先前那樣跟著十字準線的位置跑,準線移到畫面中央或邊緣
            外時數字會看不到或跟內容擠在一起)。這段刻意放在 pan/zoom 的 <g>
            外面,自己手算 screen 座標(pan.x + contentX·zoom),這樣字級固定
            不受 zoom 影響,邊界外的值夾在可視範圍內,永遠讀得到。 */}
        {layers.grid && (() => {
          const b = getVisibleWorldBounds();
          const MARGIN = 6;
          const xs: number[] = [], ys: number[] = [];
          for (let x = Math.ceil(b.xMin / gridStep) * gridStep; x <= b.xMax; x += gridStep) xs.push(x);
          for (let y = Math.ceil(b.yMin / gridStep) * gridStep; y <= b.yMax; y += gridStep) ys.push(y);
          const toScreen = (wx: number, wy: number) => {
            const c = px(wx, wy);
            return { x: pan.x + c.x * zoom, y: pan.y + c.y * zoom };
          };
          return (
            <g>
              {xs.map((x) => {
                const s = toScreen(x, 0);
                const sx = Math.min(Math.max(s.x, MARGIN + 8), WIDTH_PX - MARGIN - 8);
                return (
                  <text key={`xtick-${x}`} x={sx} y={HEIGHT_PX - MARGIN} fill={COLOR.muted} fontSize={9} textAnchor="middle">
                    {x.toFixed(0)}
                  </text>
                );
              })}
              {ys.map((y) => {
                const s = toScreen(0, y);
                const sy = Math.min(Math.max(s.y, MARGIN + 8), HEIGHT_PX - MARGIN);
                return (
                  <text key={`ytick-${y}`} x={MARGIN} y={sy} fill={COLOR.muted} fontSize={9} textAnchor="start">
                    {y.toFixed(0)}
                  </text>
                );
              })}
            </g>
          );
        })()}

        {/* 標題與座標懸浮讀值(不套用 zoom/pan,固定在畫布座標)。數值加粗、標籤
            正常粗細——lifeflat「數值一律 800,明度/字重即資訊層級」的語法。 */}
        <text x={12} y={18} fill="#e5e7eb" fontSize={12}>
          <tspan fontWeight={800}>N={N}</tspan>
          {'  '}<tspan fontWeight={800}>S={S.toFixed(1)}m</tspan>
          {'  '}<tspan fontWeight={800}>β={betaDeg.toFixed(1)}°</tspan>
          {'  '}<tspan fontWeight={800}>φ={phi.toFixed(0)}°</tspan>
          {'  覆蓋(-3dB)='}<tspan fontWeight={800}>{covW.toFixed(1)}m</tspan>
        </text>
        {hoverWorld && (
          <text x={WIDTH_PX - 8} y={HEIGHT_PX - 8} fill={COLOR.muted} fontSize={10} textAnchor="end">
            游標: <tspan fontWeight={700}>({hoverWorld.x.toFixed(2)}, {hoverWorld.y.toFixed(2)})</tspan> m
          </text>
        )}
        {measureActive && measurePoints.length < 2 && (
          <text x={WIDTH_PX - 8} y={16} fill={COLOR.measure} fontSize={10} textAnchor="end">
            量測模式:點選兩點({measurePoints.length}/2)
          </text>
        )}
      </svg>
    </div>
  );
}
