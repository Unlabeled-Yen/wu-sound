'use client';

import { useMemo, useState } from 'react';
import { tabSplay } from '@/lib/array-designer';
import type { CatalogItem } from '@/lib/types';
import ArrayCoverageDiagram from './ArrayCoverageDiagram';
import {
  ErrorNote, ValidationNote, NumberField, ResultPanel, fmt, GENERIC_ERROR_MSG,
  useSpeakerCov, SpeakerCovSection, TabHeader,
} from './shared';

const DEFAULTS = { quantity: '5', targetUnityM: '3.5', spacingM: '5.0', coverageDeg: '110' };

// Find Splay:給定數量 + Target Unity + 間距 + 覆蓋角,求所需張角。
// Splay 是這個分頁的輸出,不是輸入(跟 Unity/Spacing 分頁相反)。
export default function SplayTab({ speakers }: { speakers: CatalogItem[] }) {
  const cov = useSpeakerCov(DEFAULTS.coverageDeg, speakers);
  const [quantity, setQuantity] = useState(DEFAULTS.quantity);
  const [targetUnityM, setTargetUnityM] = useState(DEFAULTS.targetUnityM);
  const [spacingM, setSpacingM] = useState(DEFAULTS.spacingM);

  function resetAll() {
    cov.reset();
    setQuantity(DEFAULTS.quantity);
    setTargetUnityM(DEFAULTS.targetUnityM);
    setSpacingM(DEFAULTS.spacingM);
  }

  const inputs = useMemo(
    () => ({
      quantity: Math.round(Number(quantity)),
      targetUnityM: Number(targetUnityM),
      spacingM: Number(spacingM),
      coverageDeg: Number(cov.coverageDeg),
    }),
    [quantity, targetUnityM, spacingM, cov.coverageDeg],
  );

  const inputsValid =
    Number.isInteger(inputs.quantity) && inputs.quantity >= 1 &&
    Number.isFinite(inputs.targetUnityM) && inputs.targetUnityM > 0 &&
    Number.isFinite(inputs.spacingM) && inputs.spacingM > 0 &&
    Number.isFinite(inputs.coverageDeg) && inputs.coverageDeg > 0 && inputs.coverageDeg < 180;

  const result = useMemo(() => {
    if (!inputsValid) return null;
    try {
      return tabSplay(inputs.quantity, inputs.targetUnityM, inputs.spacingM, inputs.coverageDeg);
    } catch {
      return { error: GENERIC_ERROR_MSG };
    }
  }, [inputsValid, inputs]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 items-start">
      <div className="flex flex-col gap-6">
        <SpeakerCovSection speakers={speakers} {...cov} />

        <section className="nm-raised rounded-2xl p-4 space-y-3">
          <TabHeader title="Find Splay" onReset={resetAll} />
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Quantity(pcs)" value={quantity} onChange={setQuantity} tip="已經定案的喇叭支數。" />
            <NumberField
              label="Target Unity(m)" value={targetUnityM} onChange={setTargetUnityM}
              tip="你想要聲音『剛好接上』的深度。這個分頁是最後手段:數量、間距、觀眾距離全部被鎖死了,只剩掰角可以調。"
            />
          </div>
          <NumberField label="Spacing(m)" value={spacingM} onChange={setSpacingM} tip="已經固定的喇叭間距(常見於吊點限制)。" />
        </section>

        {!inputsValid && <ValidationNote message="請確認 Quantity ≥1、Target Unity、Spacing 為正數,覆蓋角介於 0~180 度之間。" />}
        {result && 'error' in result && <ErrorNote message={result.error} />}
      </div>

      {result && !('error' in result) && (
        <ResultPanel
          title="計算結果"
          rangeMinM={result.rangeMinM}
          rangeMaxM={result.rangeMaxM}
          stats={[
            { label: 'Req. Splay', value: `${fmt(result.splayDeg)} deg`, tip: '要在數量/間距都鎖死的情況下,讓縫隙在 Target Unity 深度剛好消失,每支喇叭需要額外掰開的角度。' },
            { label: 'Rec. Width (-3dB)', value: `${fmt(result.suggestedWidthM)} m`, tip: '較保守門檻算出的建議覆蓋寬度。' },
            { label: 'Max Width (-6dB)', value: `${fmt(result.actualWidthM)} m`, danger: true, tip: '理論覆蓋上限,不是建議值——貼著這個數字設計已經開始有重疊感。' },
            { label: 'Limit(Overlap)', value: `${fmt(result.dMaxM)} m`, tip: '重疊惡化的絕對邊界深度。' },
          ]}
        >
          <ArrayCoverageDiagram
            quantity={inputs.quantity}
            spacingM={inputs.spacingM}
            coverageDeg={inputs.coverageDeg}
            betaDeg={result.splayDeg}
            audienceDistM={inputs.targetUnityM}
            depthLabel="Target Unity"
            coverageWidth3dbM={result.suggestedWidthM}
            rangeMinM={result.rangeMinM}
            rangeMaxM={result.rangeMaxM}
            unityDistM={inputs.targetUnityM}
            limitDepthM={result.dMaxM}
          />
        </ResultPanel>
      )}
    </div>
  );
}
