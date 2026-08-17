'use client';

import { useMemo, useState } from 'react';
import { tabUnity } from '@/lib/array-designer';
import type { CatalogItem } from '@/lib/types';
import { ErrorNote, ValidationNote, GENERIC_ERROR_MSG, useSpeakerCov, Legend } from './shared';
import ArrayCoverageDiagram from './ArrayCoverageDiagram';
import { ArrayPanelHeader } from './ArrayPanelHeader';
import { ArraySidebar, ArrayConditionInputRow, ArrayConditionRow } from './ArraySidebar';
import { ArraySolvePills, type TabKey } from './ArraySolvePills';

const DEFAULTS = { quantity: '5', spacingM: '7', splayDeg: '0.0', coverageDeg: '110' };

// Find Unity Distance:給定數量 + 間距 + Splay + 覆蓋角,求 unity 交會深度。
// 計算邏輯不動(tabUnity)——併頁改版只換版面。
export default function UnityTab({ speakers, active, onChangeTab }: { speakers: CatalogItem[]; active: TabKey; onChangeTab: (key: TabKey) => void }) {
  const cov = useSpeakerCov(DEFAULTS.coverageDeg, speakers);
  const [quantity, setQuantity] = useState(DEFAULTS.quantity);
  const [spacingM, setSpacingM] = useState(DEFAULTS.spacingM);
  const [splayDeg, setSplayDeg] = useState(DEFAULTS.splayDeg);
  const [legendOpen, setLegendOpen] = useState(false);

  const inputs = useMemo(
    () => ({
      quantity: Math.round(Number(quantity)),
      spacingM: Number(spacingM),
      splayDeg: Number(splayDeg),
      coverageDeg: Number(cov.coverageDeg),
    }),
    [quantity, spacingM, splayDeg, cov.coverageDeg],
  );

  const inputsValid =
    Number.isInteger(inputs.quantity) && inputs.quantity >= 1 &&
    Number.isFinite(inputs.spacingM) && inputs.spacingM > 0 &&
    Number.isFinite(inputs.splayDeg) && inputs.splayDeg >= 0 &&
    Number.isFinite(inputs.coverageDeg) && inputs.coverageDeg > 0 && inputs.coverageDeg < 180;

  const result = useMemo(() => {
    if (!inputsValid) return null;
    try {
      return tabUnity(inputs.quantity, inputs.spacingM, inputs.splayDeg, inputs.coverageDeg);
    } catch {
      return { error: GENERIC_ERROR_MSG };
    }
  }, [inputsValid, inputs]);

  const isActive = active === 'unity';
  const conditionsSlot = (
    <>
      {speakers.length > 0 && <ArrayConditionRow label="喇叭" value={cov.selectedSpeaker ? [cov.selectedSpeaker.brand, cov.selectedSpeaker.name].filter(Boolean).join(' ') : '手動輸入'} />}
      <ArrayConditionInputRow label="覆蓋角" value={cov.coverageDeg} onChange={cov.setCoverageDeg} unit="°" color="#8fd0ee" />
      <ArrayConditionInputRow label="數量" value={quantity} onChange={setQuantity} unit="支" />
      <ArrayConditionInputRow label="間距" value={spacingM} onChange={setSpacingM} unit="m" />
      <ArrayConditionInputRow label="Splay" value={splayDeg} onChange={setSplayDeg} unit="°" />
      {cov.selectedSpeaker && cov.selectedSpeaker.coverage_h_deg == null && (
        <ValidationNote message="此品項尚未建檔覆蓋角規格,請查廠商 datasheet 手動輸入。" />
      )}
    </>
  );

  if (!inputsValid || !result || 'error' in result) {
    return (
      <div style={{ display: isActive ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0, gap: 12 }}>
        <div className="flex-none rounded-xl px-4 py-3" style={{ background: 'rgba(8,8,10,.4)', border: '1px solid rgba(255,255,255,.13)' }}>
          {!inputsValid && <ValidationNote message="請確認 Quantity ≥1、Spacing 為正數、Splay ≥0,覆蓋角介於 0~180 度之間。" />}
          {result && 'error' in result && <ErrorNote message={result.error} />}
        </div>
        <div className="flex-1 min-h-0 flex gap-3">
          <div className="flex-1" />
          <ArraySidebar conditionsSlot={conditionsSlot} stats={[]} pillsSlot={<ArraySolvePills active={active} onChange={onChangeTab} />} />
        </div>
      </div>
    );
  }

  const audienceDistM = result.unityDistM;
  const inRange = audienceDistM >= result.rangeMinM && audienceDistM <= result.rangeMaxM;

  return (
    <div style={{ display: isActive ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0, gap: 12 }}>
      <ArrayPanelHeader
        quantity={inputs.quantity}
        spacingM={inputs.spacingM}
        audienceDistM={audienceDistM}
        inRange={inRange}
        tooClose={audienceDistM < result.rangeMinM}
        rangeMinM={result.rangeMinM}
        rangeMaxM={result.rangeMaxM}
        limitDepthM={result.dMaxM}
        legendOpen={legendOpen}
        onToggleLegend={() => setLegendOpen((v) => !v)}
        legendSlot={<Legend />}
      />
      <div className="flex-1 min-h-0 flex gap-3">
        <div className="flex-1 min-w-0 rounded-xl relative overflow-hidden" style={{ border: '1px dashed rgba(255,255,255,.2)', background: 'rgba(8,8,10,.34)' }}>
          <ArrayCoverageDiagram
            variant="summary"
            quantity={inputs.quantity}
            spacingM={inputs.spacingM}
            coverageDeg={inputs.coverageDeg}
            betaDeg={inputs.splayDeg}
            audienceDistM={audienceDistM}
            depthLabel="Unity(算出)"
            coverageWidth3dbM={result.suggestedWidthM}
            rangeMinM={result.rangeMinM}
            rangeMaxM={result.rangeMaxM}
            unityDistM={result.unityDistM}
            limitDepthM={result.dMaxM}
          />
        </div>
        <ArraySidebar
          conditionsSlot={conditionsSlot}
          stats={[
            { label: 'Rec. Width −3dB', value: `${result.suggestedWidthM.toFixed(1)} m`, color: '#8fd0ee' },
            { label: 'Unity Dist −6dB', value: `${result.unityDistM.toFixed(1)} m`, color: '#d8bd7a' },
            { label: 'Limit', value: `${result.dMaxM.toFixed(1)} m`, color: '#8b8f98' },
          ]}
          pillsSlot={<ArraySolvePills active={active} onChange={onChangeTab} />}
        />
      </div>
    </div>
  );
}
