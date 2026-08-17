'use client';

import { useMemo, useState } from 'react';
import { tabQuantity } from '@/lib/array-designer';
import type { CatalogItem } from '@/lib/types';
import { ErrorNote, ValidationNote, GENERIC_ERROR_MSG, useSpeakerCov, Legend } from './shared';
import ArrayCoverageDiagram from './ArrayCoverageDiagram';
import { ArrayPanelHeader } from './ArrayPanelHeader';
import { ArraySidebar, ArrayConditionInputRow, ArrayConditionRow } from './ArraySidebar';
import { ArraySolvePills, type TabKey } from './ArraySolvePills';

const DEFAULTS = { targetWidthM: '28', spacingM: '7', coverageDeg: '110' };

// Find Quantity (N):給定目標寬度 + 間距 + 覆蓋角,求所需喇叭數。計算邏輯不動
// (tabQuantity)。這個分頁沒有 Splay 欄位、beta 固定 0;Unity Dist 是算出來的
// 唯讀顯示,不是輸入——併頁改版只換版面(見 AutoModeTab.tsx 開頭說明)。
export default function QuantityTab({ speakers, active, onChangeTab }: { speakers: CatalogItem[]; active: TabKey; onChangeTab: (key: TabKey) => void }) {
  const cov = useSpeakerCov(DEFAULTS.coverageDeg, speakers);
  const [targetWidthM, setTargetWidthM] = useState(DEFAULTS.targetWidthM);
  const [spacingM, setSpacingM] = useState(DEFAULTS.spacingM);
  const [legendOpen, setLegendOpen] = useState(false);

  const inputs = useMemo(
    () => ({
      targetWidthM: Number(targetWidthM),
      spacingM: Number(spacingM),
      coverageDeg: Number(cov.coverageDeg),
    }),
    [targetWidthM, spacingM, cov.coverageDeg],
  );

  const inputsValid =
    Number.isFinite(inputs.targetWidthM) && inputs.targetWidthM > 0 &&
    Number.isFinite(inputs.spacingM) && inputs.spacingM > 0 &&
    Number.isFinite(inputs.coverageDeg) && inputs.coverageDeg > 0 && inputs.coverageDeg < 180;

  const result = useMemo(() => {
    if (!inputsValid) return null;
    try {
      return tabQuantity(inputs.targetWidthM, inputs.spacingM, 0, inputs.coverageDeg);
    } catch {
      return { error: GENERIC_ERROR_MSG };
    }
  }, [inputsValid, inputs]);

  const isActive = active === 'quantity';
  const conditionsSlot = (
    <>
      {speakers.length > 0 && <ArrayConditionRow label="喇叭" value={cov.selectedSpeaker ? [cov.selectedSpeaker.brand, cov.selectedSpeaker.name].filter(Boolean).join(' ') : '手動輸入'} />}
      <ArrayConditionInputRow label="覆蓋角" value={cov.coverageDeg} onChange={cov.setCoverageDeg} unit="°" color="#8fd0ee" />
      <ArrayConditionInputRow label="目標寬度" value={targetWidthM} onChange={setTargetWidthM} unit="m" />
      <ArrayConditionInputRow label="間距" value={spacingM} onChange={setSpacingM} unit="m" />
      {cov.selectedSpeaker && cov.selectedSpeaker.coverage_h_deg == null && (
        <ValidationNote message="此品項尚未建檔覆蓋角規格,請查廠商 datasheet 手動輸入。" />
      )}
    </>
  );

  if (!inputsValid || !result || 'error' in result) {
    return (
      <div style={{ display: isActive ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0, gap: 12 }}>
        <div className="flex-none rounded-xl px-4 py-3" style={{ background: 'rgba(8,8,10,.4)', border: '1px solid rgba(255,255,255,.13)' }}>
          {!inputsValid && <ValidationNote message="請確認 Target Width、Spacing 為正數,覆蓋角介於 0~180 度之間。" />}
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
        quantity={result.quantity}
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
            quantity={result.quantity}
            spacingM={inputs.spacingM}
            coverageDeg={inputs.coverageDeg}
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
