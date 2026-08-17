// 陣列面板標題列(16-acoustic-merged.md §4-1)。深度軸放在這一列的右側,不是
// 獨立一列——這是併頁省下一整排高度的關鍵,拉成獨立列示意圖會從 424 掉到 364。
// 尺度固定 0–9 m,每個位置 = 值 / 9 * 100,不得硬編碼百分比(見 §8 驗收 script)。
function fmt(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(digits);
}

const DEPTH_SCALE_MAX = 9;
const pct = (m: number) => Math.max(0, Math.min(100, (m / DEPTH_SCALE_MAX) * 100));

export function ArrayPanelHeader({
  quantity, spacingM, audienceDistM, inRange, tooClose,
  rangeMinM, rangeMaxM, limitDepthM,
  legendOpen, onToggleLegend, legendSlot,
}: {
  quantity: number;
  spacingM: number;
  audienceDistM: number;
  inRange: boolean;
  tooClose: boolean;
  rangeMinM: number;
  rangeMaxM: number;
  limitDepthM: number;
  legendOpen: boolean;
  onToggleLegend: () => void;
  legendSlot: React.ReactNode;
}) {
  const minPct = pct(rangeMinM);
  const maxPct = pct(rangeMaxM);
  const audPct = pct(audienceDistM);
  const limitPct = pct(limitDepthM);

  return (
    <div className="flex-none relative flex items-center gap-[22px]">
      <div className="flex-none">
        <div className="uppercase mb-[7px]" style={{ font: '400 10px/1 "Noto Sans TC",sans-serif', letterSpacing: '.16em', color: '#6fc0e8' }}>陣列設計器</div>
        <div className="flex items-baseline gap-3">
          <span className="flex items-baseline gap-1">
            <span className="tabular-nums" style={{ font: '600 32px/1 ui-monospace,SFMono-Regular,Menlo,monospace', color: '#8fd0ee' }}>{quantity}</span>
            <span style={{ font: '400 13px/1 "Noto Sans TC",sans-serif', color: '#8a8b90' }}>支</span>
          </span>
          <span style={{ color: '#3a3b40', fontSize: 17 }}>／</span>
          <span className="flex items-baseline gap-1">
            <span className="tabular-nums" style={{ font: '600 32px/1 ui-monospace,SFMono-Regular,Menlo,monospace', color: '#8fd0ee' }}>{fmt(spacingM)}</span>
            <span style={{ font: '400 13px/1 "Noto Sans TC",sans-serif', color: '#8a8b90' }}>m 間距</span>
          </span>
        </div>
      </div>

      <div
        className="flex-none flex items-center gap-[7px]"
        style={
          inRange
            ? { padding: '6px 11px', borderRadius: 9, background: 'rgba(126,207,157,.14)', border: '1px solid rgba(126,207,157,.38)' }
            : { padding: '6px 11px', borderRadius: 9, background: 'rgba(224,122,122,.14)', border: '1px solid rgba(224,122,122,.38)' }
        }
      >
        <span className="block" style={{ width: 5, height: 5, borderRadius: 999, background: inRange ? '#7ecf9d' : '#e07a7a' }} />
        <span style={{ font: '400 11.5px/1 "Noto Sans TC",sans-serif', color: inRange ? '#a9e3c1' : '#e5a0a0' }}>
          {inRange ? `觀眾席 ${fmt(audienceDistM)} m 落在好聲音區間` : `觀眾席 ${fmt(audienceDistM)} m ${tooClose ? '太近' : '太遠'}`}
        </span>
      </div>

      <div className="flex-1 min-w-0 relative" style={{ height: 40, borderLeft: '1px solid rgba(255,255,255,.08)', paddingLeft: 22 }}>
        <div className="absolute" style={{ left: 22, right: 0, top: 13, height: 14, borderRadius: 3, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)' }} />
        {maxPct > minPct && (
          <div
            className="absolute"
            data-ruler-mark data-value={rangeMinM}
            style={{ left: `calc(22px + ${minPct}%)`, width: `${maxPct - minPct}%`, top: 13, height: 14, background: 'rgba(126,207,157,.34)' }}
          />
        )}
        <div className="absolute" data-ruler-mark data-value={rangeMinM} style={{ left: `calc(22px + ${minPct}%)`, top: 8, width: 1.5, height: 24, background: '#e07a7a' }} />
        <div className="absolute" data-ruler-mark data-value={rangeMaxM} style={{ left: `calc(22px + ${maxPct}%)`, top: 8, width: 1.5, height: 24, background: '#e07a7a' }} />
        <div className="absolute" data-ruler-mark data-value={limitDepthM} style={{ left: `calc(22px + ${limitPct}%)`, top: 8, width: 1.5, height: 24, background: '#8b8f98' }} />
        <div className="absolute" data-ruler-mark data-value={audienceDistM} style={{ left: `calc(22px + ${audPct}%)`, top: 5, width: 3, height: 30, background: '#a068d5', boxShadow: '0 0 8px rgba(160,104,213,.6)' }} />
        <span className="absolute tabular-nums" style={{ left: `calc(22px + ${minPct}% - 13px)`, top: -4, font: '400 9.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace', color: '#e5a0a0' }}>{fmt(rangeMinM)}</span>
        <span className="absolute tabular-nums" style={{ left: `calc(22px + ${audPct}% + 7px)`, top: -4, font: '500 9.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace', color: '#c39ae8' }}>Aud {fmt(audienceDistM)}</span>
        <span className="absolute tabular-nums" style={{ left: `calc(22px + ${maxPct}% - 13px)`, top: -4, font: '400 9.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace', color: '#e5a0a0' }}>{fmt(rangeMaxM)}</span>
        <span className="absolute tabular-nums" style={{ left: `calc(22px + ${limitPct}% + 4px)`, top: -4, font: '400 9.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace', color: '#8b8f98' }}>Limit {fmt(limitDepthM)}</span>
        <span className="absolute" style={{ left: 22, bottom: -2, font: '400 9.5px/1 "Noto Sans TC",sans-serif', color: '#5a5b60' }}>
          深度軸 0–{DEPTH_SCALE_MAX} m　·　<span style={{ color: '#7ecf9d' }}>綠帶＝好聲音區間</span>　·
          <button type="button" onClick={onToggleLegend} className="underline" style={{ color: '#8a8b90' }}>圖例說明 {legendOpen ? '▴' : '▾'}</button>
        </span>
      </div>
      {legendOpen && <div className="absolute right-5 top-[60px] z-10">{legendSlot}</div>}
    </div>
  );
}
