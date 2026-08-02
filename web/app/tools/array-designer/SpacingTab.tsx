'use client';

import { useMemo, useState } from 'react';
import { tabSpacing } from '@/lib/array-designer';
import type { CatalogItem } from '@/lib/types';
import ArrayCoverageDiagram from './ArrayCoverageDiagram';
import {
  ErrorNote, ValidationNote, NumberField, ResultPanel, fmt, GENERIC_ERROR_MSG,
  useSpeakerCov, SpeakerCovSection, TabHeader,
} from './shared';

const DEFAULTS = { quantity: '5', targetUnityM: '4', splayDeg: '0.0', coverageDeg: '110' };

// Find Spacing:給定數量 + Target Unity + Splay + 覆蓋角,求所需間距。
export default function SpacingTab({ speakers }: { speakers: CatalogItem[] }) {
  const cov = useSpeakerCov(DEFAULTS.coverageDeg, speakers);
  const [quantity, setQuantity] = useState(DEFAULTS.quantity);
  const [targetUnityM, setTargetUnityM] = useState(DEFAULTS.targetUnityM);
  const [splayDeg, setSplayDeg] = useState(DEFAULTS.splayDeg);

  function resetAll() {
    cov.reset();
    setQuantity(DEFAULTS.quantity);
    setTargetUnityM(DEFAULTS.targetUnityM);
    setSplayDeg(DEFAULTS.splayDeg);
  }

  const inputs = useMemo(
    () => ({
      quantity: Math.round(Number(quantity)),
      targetUnityM: Number(targetUnityM),
      splayDeg: Number(splayDeg),
      coverageDeg: Number(cov.coverageDeg),
    }),
    [quantity, targetUnityM, splayDeg, cov.coverageDeg],
  );

  const inputsValid =
    Number.isInteger(inputs.quantity) && inputs.quantity >= 1 &&
    Number.isFinite(inputs.targetUnityM) && inputs.targetUnityM > 0 &&
    Number.isFinite(inputs.splayDeg) && inputs.splayDeg >= 0 &&
    Number.isFinite(inputs.coverageDeg) && inputs.coverageDeg > 0 && inputs.coverageDeg < 180;

  const result = useMemo(() => {
    if (!inputsValid) return null;
    try {
      return tabSpacing(inputs.quantity, inputs.targetUnityM, inputs.splayDeg, inputs.coverageDeg);
    } catch {
      return { error: GENERIC_ERROR_MSG };
    }
  }, [inputsValid, inputs]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 items-start">
      <div className="flex flex-col gap-6">
        <SpeakerCovSection speakers={speakers} {...cov} />

        <section className="nm-raised rounded-2xl p-4 space-y-3">
          <TabHeader title="Find Spacing" onReset={resetAll} />
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Quantity(pcs)" value={quantity} onChange={setQuantity} tip="已經定案的喇叭支數。" />
            <NumberField
              label="Target Unity(m)" value={targetUnityM} onChange={setTargetUnityM}
              tip="你想要聲音『剛好接上』的深度,通常是觀眾席位置。這個分頁反推:要讓縫隙在這裡剛好消失,間距該擺多開?"
            />
          </div>
          <NumberField
            label="Splay(deg)" value={splayDeg} onChange={setSplayDeg}
            tip="每支喇叭額外掰開的角度。設為 0 表示喇叭互相平行,不外八。"
          />
        </section>

        {!inputsValid && <ValidationNote message="請確認 Quantity ≥1、Target Unity 為正數、Splay ≥0,覆蓋角介於 0~180 度之間。" />}
        {result && 'error' in result && <ErrorNote message={result.error} />}
      </div>

      {result && !('error' in result) && (
        <ResultPanel
          title="計算結果"
          rangeMinM={result.rangeMinM}
          rangeMaxM={result.rangeMaxM}
          stats={[
            { label: 'Req. Spacing', value: `${fmt(result.spacingM)} m`, tip: '要達到你設定的 Target Unity 深度,相鄰喇叭需要的間距。' },
            { label: 'Rec. Width (-3dB)', value: `${fmt(result.suggestedWidthM)} m`, tip: '較保守門檻算出的建議覆蓋寬度。' },
            { label: 'Max Width (-6dB)', value: `${fmt(result.actualWidthM)} m`, danger: true, tip: '理論覆蓋上限,不是建議值——貼著這個數字設計已經開始有重疊感。' },
            { label: 'Limit(Overlap)', value: `${fmt(result.dMaxM)} m`, tip: '重疊惡化的絕對邊界深度。' },
          ]}
        >
          <ArrayCoverageDiagram
            quantity={inputs.quantity}
            spacingM={result.spacingM}
            coverageDeg={inputs.coverageDeg}
            betaDeg={inputs.splayDeg}
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
