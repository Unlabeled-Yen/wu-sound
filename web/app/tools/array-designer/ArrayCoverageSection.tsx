import ArrayCoverageDiagram from './ArrayCoverageDiagram';

function fmt(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(digits);
}

// 覆蓋示意(俯視)+ 三個統計:ArrayCoverageDiagram 原樣嵌入,不重畫幾何。
// Limit 用灰字——它是重疊惡化的邊界,不是建議值,不該跟其他數字同一個視覺權重。
export function ArrayCoverageSection({
  quantity, spacingM, coverageDeg, audienceDistM,
  coverageWidth3dbM, rangeMinM, rangeMaxM, unityDistM, limitDepthM,
}: {
  quantity: number;
  spacingM: number;
  coverageDeg: number;
  audienceDistM: number;
  coverageWidth3dbM: number;
  rangeMinM: number;
  rangeMaxM: number;
  unityDistM: number;
  limitDepthM: number;
}) {
  return (
    <div className="rounded-[20px] flex flex-col" style={{ background: 'rgba(8,8,10,.4)', border: '1px solid rgba(255,255,255,.13)', boxShadow: 'inset 0 1px 3px rgba(0,0,0,.5)', padding: '20px 22px' }}>
      <div className="text-[15px] font-semibold mb-4" style={{ color: 'var(--nm-text-primary)' }}>覆蓋示意(俯視)</div>
      <div className="flex-1 min-h-[250px] flex items-center justify-center">
        <ArrayCoverageDiagram
          quantity={quantity}
          spacingM={spacingM}
          coverageDeg={coverageDeg}
          audienceDistM={audienceDistM}
          depthLabel="觀眾席"
          coverageWidth3dbM={coverageWidth3dbM}
          rangeMinM={rangeMinM}
          rangeMaxM={rangeMaxM}
          unityDistM={unityDistM}
          limitDepthM={limitDepthM}
        />
      </div>
      <div className="grid grid-cols-3 gap-3.5 mt-4.5 pt-4.5" style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid rgba(255,255,255,.07)' }}>
        <div>
          <div className="text-[11px] mb-1.5" style={{ color: 'var(--nm-text-muted)' }}>實際覆蓋寬度 −3dB</div>
          <div className="text-[17px] font-medium" style={{ color: 'var(--nm-text-primary)' }}>{fmt(coverageWidth3dbM)} m</div>
        </div>
        <div>
          <div className="text-[11px] mb-1.5" style={{ color: 'var(--nm-text-muted)' }}>Unity 距離 −6dB</div>
          <div className="text-[17px] font-medium" style={{ color: 'var(--nm-text-primary)' }}>{fmt(unityDistM)} m</div>
        </div>
        <div>
          <div className="text-[11px] mb-1.5" style={{ color: 'var(--nm-text-muted)' }}>Limit(Overlap)</div>
          <div className="text-[17px] font-medium" style={{ color: '#b8b8bb' }}>{fmt(limitDepthM)} m</div>
        </div>
      </div>
      <p className="text-[12px] mt-3" style={{ color: 'var(--nm-text-muted)' }}>
        此為自由場等腰弧列幾何理論值,未計入場地反射、器材規格誤差等現場變因,實際佈點仍需現場覆核。
      </p>
    </div>
  );
}
