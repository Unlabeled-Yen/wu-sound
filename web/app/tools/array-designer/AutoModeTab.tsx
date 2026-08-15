'use client';

import { useMemo, useState } from 'react';
import { autoModeWithOverride, type ForceQty } from '@/lib/array-designer';
import type { CatalogItem } from '@/lib/types';
import ArrayCoverageDiagram from './ArrayCoverageDiagram';
import {
  ErrorNote, ValidationNote, NumberField, ResultPanel, fmt, GENERIC_ERROR_MSG,
  useSpeakerCov, SpeakerCovSection, TabHeader, InfoTip,
} from './shared';

const FORCE_LABEL: Record<ForceQty, string> = {
  auto: '自動',
  odd: '強制奇數',
  even: '強制偶數',
};

const DEFAULTS = { targetWidthM: '20', audienceDistM: '5', forceQty: 'auto' as ForceQty, coverageDeg: '90' };

// 對照原軟體 Rec. Quantity / Rec. Spacing 旁邊的 Auto 按鈕+可編輯 spinner:
// 系統建議的值可以手動覆寫(例如吊點只能是整數米,系統建議 5.2m 但現場只能用
// 5.0m),按 Auto 恢復系統接管。覆寫後的重算邏輯見 array-designer.ts 裡
// autoModeWithOverride 的說明——這段是推論出來的,不是 ground truth 驗證過。
function OverrideField({
  label, unit, displayValue, isAuto, overrideText, onOverrideChange, onAuto, tip,
}: {
  label: string;
  unit: string;
  displayValue: string;
  isAuto: boolean;
  overrideText: string;
  onOverrideChange: (v: string) => void;
  onAuto: () => void;
  tip: string;
}) {
  return (
    <div className="grid gap-1">
      <span className="text-sm inline-flex items-center" style={{ color: 'var(--nm-text-secondary)' }}>
        {label}
        <InfoTip text={tip} />
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onAuto}
          className={isAuto ? 'nm-btn-solid' : 'nm-btn'}
          style={{ minHeight: 'auto', padding: '6px 12px', fontSize: 12 }}
        >
          Auto
        </button>
        <input
          type="number"
          inputMode="decimal"
          className="nm-input flex-1"
          value={isAuto ? displayValue : overrideText}
          onChange={(e) => onOverrideChange(e.target.value)}
        />
        <span className="text-sm" style={{ color: 'var(--nm-text-muted)' }}>{unit}</span>
      </div>
    </div>
  );
}

export default function AutoModeTab({ speakers }: { speakers: CatalogItem[] }) {
  const cov = useSpeakerCov(DEFAULTS.coverageDeg, speakers);
  const [targetWidthM, setTargetWidthM] = useState(DEFAULTS.targetWidthM);
  const [audienceDistM, setAudienceDistM] = useState(DEFAULTS.audienceDistM);
  const [forceQty, setForceQty] = useState<ForceQty>(DEFAULTS.forceQty);
  // null = Auto(系統接管),非 null = 使用者手動覆寫的文字輸入。
  const [spacingOverride, setSpacingOverride] = useState<string | null>(null);
  const [qtyOverride, setQtyOverride] = useState<string | null>(null);

  function resetAll() {
    cov.reset();
    setTargetWidthM(DEFAULTS.targetWidthM);
    setAudienceDistM(DEFAULTS.audienceDistM);
    setForceQty(DEFAULTS.forceQty);
    setSpacingOverride(null);
    setQtyOverride(null);
  }

  const inputs = useMemo(
    () => ({
      targetWidthM: Number(targetWidthM),
      audienceDistM: Number(audienceDistM),
      coverageDeg: Number(cov.coverageDeg),
    }),
    [targetWidthM, audienceDistM, cov.coverageDeg],
  );

  const inputsValid =
    Number.isFinite(inputs.targetWidthM) && inputs.targetWidthM > 0 &&
    Number.isFinite(inputs.audienceDistM) && inputs.audienceDistM > 0 &&
    Number.isFinite(inputs.coverageDeg) && inputs.coverageDeg > 0 && inputs.coverageDeg < 180;

  const overrideS = spacingOverride !== null && spacingOverride !== '' ? Number(spacingOverride) : undefined;
  const overrideN = qtyOverride !== null && qtyOverride !== '' ? Math.round(Number(qtyOverride)) : undefined;
  const overridesValid =
    (overrideS === undefined || (Number.isFinite(overrideS) && overrideS > 0)) &&
    (overrideN === undefined || (Number.isFinite(overrideN) && overrideN >= 1));

  const result = useMemo(() => {
    if (!inputsValid || !overridesValid) return null;
    try {
      return autoModeWithOverride(inputs.targetWidthM, inputs.audienceDistM, inputs.coverageDeg, forceQty, overrideS, overrideN);
    } catch {
      return { error: GENERIC_ERROR_MSG };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputsValid, overridesValid, inputs, forceQty, overrideS, overrideN]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 items-start">
      <div className="flex flex-col gap-6">
        <SpeakerCovSection speakers={speakers} {...cov} />

        <section className="nm-raised rounded-2xl p-4 space-y-3">
          <TabHeader title="場地需求" onReset={resetAll} />
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="目標覆蓋寬度(m)" value={targetWidthM} onChange={setTargetWidthM}
              tip="這排喇叭要真正蓋滿的橫向寬度。場地多寬,決定喇叭要幾支——這是驅動整個 Auto Mode 求解的起點。"
            />
            <NumberField
              label="觀眾席距離(m)" value={audienceDistM} onChange={setAudienceDistM}
              tip="觀眾席離陣列的距離。整份設計要回答的問題就是:這個距離有沒有落在算出來的 Min~Max 好聲音區間裡。"
            />
          </div>
          <label className="grid gap-1">
            <span className="text-sm inline-flex items-center" style={{ color: 'var(--nm-text-secondary)' }}>
              喇叭數量
              <InfoTip text="要不要強制支數是奇數(中央有一支正對舞台中線)或偶數(中線是兩支喇叭之間的縫)。純現場慣例,不影響音場計算本身。" />
            </span>
            <select className="nm-input w-full" value={forceQty} onChange={(e) => setForceQty(e.target.value as ForceQty)}>
              {(Object.keys(FORCE_LABEL) as ForceQty[]).map((f) => (
                <option key={f} value={f}>{FORCE_LABEL[f]}</option>
              ))}
            </select>
          </label>

          <OverrideField
            label="建議數量" unit="支" isAuto={qtyOverride === null}
            displayValue={result && !('error' in result) ? `${result.quantity}` : ''}
            overrideText={qtyOverride ?? ''}
            onOverrideChange={setQtyOverride}
            onAuto={() => setQtyOverride(null)}
            tip="系統依場地寬度自動反推的建議支數。現場常有實際限制(例如吊點數量固定),可以直接改這裡覆寫,系統會用你給的支數重算實際覆蓋寬度與有效範圍;按 Auto 恢復系統接管。"
          />
          <OverrideField
            label="建議間距" unit="m" isAuto={spacingOverride === null}
            displayValue={result && !('error' in result) ? fmt(result.spacingM) : ''}
            overrideText={spacingOverride ?? ''}
            onOverrideChange={setSpacingOverride}
            onAuto={() => setSpacingOverride(null)}
            tip="系統算出的建議間距。現場常有實際限制(例如吊點只能是整數米),可以直接改這裡覆寫,系統會用你給的間距重新反推所需支數;按 Auto 恢復系統接管。"
          />
        </section>

        {!inputsValid && <ValidationNote message="請確認覆蓋寬度、觀眾席距離為正數,覆蓋角介於 0~180 度之間。" />}
        {inputsValid && !overridesValid && <ValidationNote message="覆寫的數量需為 ≥1 的整數、覆寫的間距需為正數。" />}
        {result && 'error' in result && <ErrorNote message={result.error} />}
      </div>

      {result && !('error' in result) && (
        <ResultPanel
          title="建議陣列配置"
          rangeMinM={result.rangeMinM}
          rangeMaxM={result.rangeMaxM}
          stats={[
            { label: '實際覆蓋寬度(-3dB)', value: `${fmt(result.coverageWidth3dbM)} m`, tip: '用左側目前的數量/間距(不論是系統建議還是你手動覆寫的)實際能蓋到多寬,拿來跟目標寬度比對,確認沒有蓋不到的死角。' },
            { label: 'Unity 距離(-6dB)', value: `${fmt(result.unityDist6dbM)} m`, tip: '相鄰喇叭 -6dB 邊緣正好交會的深度——聲音銜接最完美的位置。' },
            { label: 'Limit(Overlap)', value: `${fmt(result.limitDepthM)} m`, tip: '重疊惡化的絕對邊界深度,比這更遠音質會明顯變糊。' },
          ]}
        >
          <ArrayCoverageDiagram
            quantity={result.quantity}
            spacingM={result.spacingM}
            coverageDeg={inputs.coverageDeg}
            audienceDistM={inputs.audienceDistM}
            depthLabel="觀眾席"
            coverageWidth3dbM={result.coverageWidth3dbM}
            rangeMinM={result.rangeMinM}
            rangeMaxM={result.rangeMaxM}
            unityDistM={result.unityDist6dbM}
            limitDepthM={result.limitDepthM}
          />
        </ResultPanel>
      )}
    </div>
  );
}
