'use client';

import { useMemo, useState } from 'react';
import { tabQuantity } from '@/lib/array-designer';
import type { CatalogItem } from '@/lib/types';
import ArrayCoverageDiagram from './ArrayCoverageDiagram';
import {
  ErrorNote, ValidationNote, NumberField, ResultPanel, fmt, GENERIC_ERROR_MSG,
  useSpeakerCov, SpeakerCovSection, TabHeader,
} from './shared';

const DEFAULTS = { targetWidthM: '28', spacingM: '7', coverageDeg: '110' };

// Find Quantity (N):給定目標寬度 + 間距 + 覆蓋角,求所需喇叭數。
// 原 app 此分頁沒有 Splay 欄位(bytecode 只有 q_width/q_spacing/q_speaker 三個輸入),
// beta 固定為 0。Unity Dist 是算出來的唯讀顯示,不是輸入。
export default function QuantityTab({ speakers }: { speakers: CatalogItem[] }) {
  const cov = useSpeakerCov(DEFAULTS.coverageDeg, speakers);
  const [targetWidthM, setTargetWidthM] = useState(DEFAULTS.targetWidthM);
  const [spacingM, setSpacingM] = useState(DEFAULTS.spacingM);

  function resetAll() {
    cov.reset();
    setTargetWidthM(DEFAULTS.targetWidthM);
    setSpacingM(DEFAULTS.spacingM);
  }

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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 items-start">
      <div className="flex flex-col gap-6">
        <SpeakerCovSection speakers={speakers} {...cov} />

        <section className="nm-raised rounded-2xl p-4 space-y-3">
          <TabHeader title="Find Quantity (N)" onReset={resetAll} />
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Target Width(m)" value={targetWidthM} onChange={setTargetWidthM}
              tip="要真正蓋滿的橫向寬度。這個分頁反過來問:間距已經被吊點鎖死了,要幾支喇叭才蓋得到這個寬度?"
            />
            <NumberField
              label="Spacing(m)" value={spacingM} onChange={setSpacingM}
              tip="現場已經固定的喇叭間距(常見於吊點、桁架限制死的場合)。這裡是已知條件,不是求解目標。"
            />
          </div>
        </section>

        {!inputsValid && <ValidationNote message="請確認 Target Width、Spacing 為正數,覆蓋角介於 0~180 度之間。" />}
        {result && 'error' in result && <ErrorNote message={result.error} />}
      </div>

      {result && !('error' in result) && (
        <ResultPanel
          title="計算結果"
          rangeMinM={result.rangeMinM}
          rangeMaxM={result.rangeMaxM}
          stats={[
            { label: 'Unity Dist (-6dB)', value: `${fmt(result.unityDistM)} m`, tip: '這個分頁不讓你直接輸入觀眾距離——系統內部把它當成「剛好接上」的深度算出來,再拿去求需要幾支喇叭。' },
            { label: 'Required Qty', value: `${result.quantity} pcs`, tip: '在你鎖死的間距下,蓋滿目標寬度需要的最少支數。' },
            { label: 'Rec. Width (-3dB)', value: `${fmt(result.suggestedWidthM)} m`, tip: '用較保守的 -3dB 門檻算出的建議覆蓋寬度,現場均勻度的參考值。' },
            { label: 'Max Width (-6dB)', value: `${fmt(result.actualWidthM)} m`, danger: true, tip: '用 -6dB 算出的理論覆蓋上限——這是天花板不是建議值,紅字提醒貼著這個數字設計已經開始有重疊感。' },
            { label: 'Limit(Overlap)', value: `${fmt(result.dMaxM)} m`, tip: '重疊惡化的絕對邊界深度,比這更遠音質會明顯變糊。' },
          ]}
        >
          <ArrayCoverageDiagram
            quantity={result.quantity}
            spacingM={inputs.spacingM}
            coverageDeg={inputs.coverageDeg}
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
