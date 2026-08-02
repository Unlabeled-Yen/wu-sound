'use client';

import { useMemo, useState } from 'react';
import { tabUnity } from '@/lib/array-designer';
import type { CatalogItem } from '@/lib/types';
import ArrayCoverageDiagram from './ArrayCoverageDiagram';
import {
  ErrorNote, ValidationNote, NumberField, ResultPanel, fmt, GENERIC_ERROR_MSG,
  useSpeakerCov, SpeakerCovSection, TabHeader,
} from './shared';

const DEFAULTS = { quantity: '5', spacingM: '7', splayDeg: '0.0', coverageDeg: '110' };

// Find Unity Distance:給定數量 + 間距 + Splay + 覆蓋角,求 unity 交會深度。
export default function UnityTab({ speakers }: { speakers: CatalogItem[] }) {
  const cov = useSpeakerCov(DEFAULTS.coverageDeg, speakers);
  const [quantity, setQuantity] = useState(DEFAULTS.quantity);
  const [spacingM, setSpacingM] = useState(DEFAULTS.spacingM);
  const [splayDeg, setSplayDeg] = useState(DEFAULTS.splayDeg);

  function resetAll() {
    cov.reset();
    setQuantity(DEFAULTS.quantity);
    setSpacingM(DEFAULTS.spacingM);
    setSplayDeg(DEFAULTS.splayDeg);
  }

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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 items-start">
      <div className="flex flex-col gap-6">
        <SpeakerCovSection speakers={speakers} {...cov} />

        <section className="nm-raised rounded-2xl p-4 space-y-3">
          <TabHeader title="Find Unity Distance" onReset={resetAll} />
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Quantity(pcs)" value={quantity} onChange={setQuantity}
              tip="手上已經有的喇叭支數。這個分頁反過來問:這些喇叭配置下,聲音接得最順的深度(甜蜜點)在幾米?"
            />
            <NumberField label="Spacing(m)" value={spacingM} onChange={setSpacingM} tip="已經固定的喇叭間距。" />
          </div>
          <NumberField
            label="Splay(deg)" value={splayDeg} onChange={setSplayDeg}
            tip="每支喇叭額外往外掰開的角度。間距被鎖死時,掰角度是唯一還能調整覆蓋範圍的手段。"
          />
        </section>

        {!inputsValid && <ValidationNote message="請確認 Quantity ≥1、Spacing 為正數、Splay ≥0,覆蓋角介於 0~180 度之間。" />}
        {result && 'error' in result && <ErrorNote message={result.error} />}
      </div>

      {result && !('error' in result) && (
        <ResultPanel
          title="計算結果"
          rangeMinM={result.rangeMinM}
          rangeMaxM={result.rangeMaxM}
          stats={[
            { label: 'Unity Dist (-6dB)', value: `${fmt(result.unityDistM)} m`, tip: '這組器材配置下,聲音銜接最完美的深度——把觀眾席安排在這附近,縫隙感最不明顯。' },
            { label: 'Rec. Width (-3dB)', value: `${fmt(result.suggestedWidthM)} m`, tip: '較保守門檻算出的建議覆蓋寬度。' },
            { label: 'Max Width (-6dB)', value: `${fmt(result.actualWidthM)} m`, danger: true, tip: '理論覆蓋上限,不是建議值——貼著這個數字設計已經開始有重疊感。' },
            { label: 'Limit(Overlap)', value: `${fmt(result.dMaxM)} m`, tip: '重疊惡化的絕對邊界深度。' },
          ]}
        >
          <ArrayCoverageDiagram
            quantity={inputs.quantity}
            spacingM={inputs.spacingM}
            coverageDeg={inputs.coverageDeg}
            betaDeg={inputs.splayDeg}
            audienceDistM={result.unityDistM}
            depthLabel="Unity(算出)"
            coverageWidth3dbM={result.suggestedWidthM}
            rangeMinM={result.rangeMinM}
            rangeMaxM={result.rangeMaxM}
            unityDistM={result.unityDistM}
            limitDepthM={result.dMaxM}
          />
        </ResultPanel>
      )}
    </div>
  );
}
