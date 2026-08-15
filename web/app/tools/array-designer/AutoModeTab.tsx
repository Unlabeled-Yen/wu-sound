'use client';

import { useEffect, useMemo, useState } from 'react';
import { autoMode, autoModeWithOverride, type ForceQty } from '@/lib/array-designer';
import type { CatalogItem } from '@/lib/types';
import { ErrorNote, ValidationNote, GENERIC_ERROR_MSG } from './shared';
import { ArrayAnswerBand } from './ArrayAnswerBand';
import { ArrayConditionsPanel } from './ArrayConditionsPanel';
import { ArrayOverrideSection } from './ArrayOverrideSection';
import { ArrayCoverageSection } from './ArrayCoverageSection';

const FORCE_LABEL: Record<ForceQty, string> = {
  auto: '自動',
  odd: '強制奇數',
  even: '強制偶數',
};

const DEFAULTS = { targetWidthM: '20', audienceDistM: '5', forceQty: 'auto' as ForceQty, coverageDeg: '90' };

// 答案先行:支數/間距搬到最上面,條件收成一區,深度軸取代圖例文字牆——
// 計算邏輯完全不動(autoMode/autoModeWithOverride),只重排版面。
// initialSpeakerId/initialAudienceDistM:SPL 計算器帶過來的跨工具交接值
// (?speaker=&throw=),只在掛載時套用一次,之後使用者可以再自己調整。
export default function AutoModeTab({
  speakers, initialSpeakerId, initialAudienceDistM,
}: {
  speakers: CatalogItem[];
  initialSpeakerId?: string;
  initialAudienceDistM?: string;
}) {
  const [speakerId, setSpeakerId] = useState('');
  const [coverageDeg, setCoverageDeg] = useState(DEFAULTS.coverageDeg);
  const selectedSpeaker = speakers.find((s) => s.id === speakerId);

  function onSpeakerChange(id: string) {
    setSpeakerId(id);
    const speaker = speakers.find((s) => s.id === id);
    if (speaker?.coverage_h_deg != null) setCoverageDeg(String(speaker.coverage_h_deg));
  }

  const [targetWidthM, setTargetWidthM] = useState(DEFAULTS.targetWidthM);
  const [audienceDistM, setAudienceDistM] = useState(DEFAULTS.audienceDistM);
  const [forceQty, setForceQty] = useState<ForceQty>(DEFAULTS.forceQty);
  // null = Auto(系統接管),非 null = 使用者手動覆寫的文字輸入。
  const [spacingOverride, setSpacingOverride] = useState<string | null>(null);
  const [qtyOverride, setQtyOverride] = useState<string | null>(null);

  // 跨工具交接:只在掛載時套用一次,不用 initial 值覆蓋使用者後續的操作。
  useEffect(() => {
    if (initialSpeakerId && speakers.some((s) => s.id === initialSpeakerId)) onSpeakerChange(initialSpeakerId);
    if (initialAudienceDistM) setAudienceDistM(initialAudienceDistM);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetAll() {
    setSpeakerId(''); setCoverageDeg(DEFAULTS.coverageDeg);
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
      coverageDeg: Number(coverageDeg),
    }),
    [targetWidthM, audienceDistM, coverageDeg],
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

  // 純 Auto(不套用任何覆寫)當「系統建議」的 ghost 值來源——不論使用者現在
  // 覆寫了哪一格,ghost 顯示的都是系統從頭算的原始建議,不是套了另一格覆寫後的中間值。
  const systemSuggestion = useMemo(() => {
    if (!inputsValid) return null;
    try {
      return autoMode(inputs.targetWidthM, inputs.audienceDistM, inputs.coverageDeg, forceQty);
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputsValid, inputs, forceQty]);

  const result = useMemo(() => {
    if (!inputsValid || !overridesValid) return null;
    try {
      return autoModeWithOverride(inputs.targetWidthM, inputs.audienceDistM, inputs.coverageDeg, forceQty, overrideS, overrideN);
    } catch {
      return { error: GENERIC_ERROR_MSG };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputsValid, overridesValid, inputs, forceQty, overrideS, overrideN]);

  const conditionsPanel = (
    <ArrayConditionsPanel
      speakers={speakers} speakerId={speakerId} onSpeakerChange={onSpeakerChange}
      coverageDeg={coverageDeg} setCoverageDeg={setCoverageDeg} selectedSpeaker={selectedSpeaker}
      targetWidthM={targetWidthM} setTargetWidthM={setTargetWidthM}
      audienceDistM={audienceDistM} setAudienceDistM={setAudienceDistM}
      onReset={resetAll}
    />
  );

  if (!inputsValid || !overridesValid || !result || 'error' in result) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-[20px] nm-raised-sm px-6 py-6">
          {!inputsValid && <ValidationNote message="請確認覆蓋寬度、觀眾席距離為正數,覆蓋角介於 0~180 度之間。" />}
          {inputsValid && !overridesValid && <ValidationNote message="覆寫的數量需為 ≥1 的整數、覆寫的間距需為正數。" />}
          {result && 'error' in result && <ErrorNote message={result.error} />}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
          {conditionsPanel}
          <div className="hidden lg:block" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ArrayAnswerBand
        quantity={result.quantity}
        spacingM={result.spacingM}
        audienceDistM={inputs.audienceDistM}
        rangeMinM={result.rangeMinM}
        rangeMaxM={result.rangeMaxM}
        unityDistM={result.unityDist6dbM}
        limitDepthM={result.limitDepthM}
      />

      <label className="flex items-center gap-3 flex-wrap rounded-[20px] nm-raised px-5 py-4">
        <span className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>喇叭數量</span>
        <select className="nm-input" style={{ width: 'auto' }} value={forceQty} onChange={(e) => setForceQty(e.target.value as ForceQty)}>
          {(Object.keys(FORCE_LABEL) as ForceQty[]).map((f) => <option key={f} value={f}>{FORCE_LABEL[f]}</option>)}
        </select>
      </label>

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
        <div className="flex flex-col gap-4">
          {conditionsPanel}
          <ArrayOverrideSection
            autoQuantity={systemSuggestion?.quantity ?? null}
            autoSpacingM={systemSuggestion?.spacingM ?? null}
            qtyOverride={qtyOverride} setQtyOverride={setQtyOverride}
            spacingOverride={spacingOverride} setSpacingOverride={setSpacingOverride}
          />
        </div>
        <ArrayCoverageSection
          quantity={result.quantity} spacingM={result.spacingM} coverageDeg={inputs.coverageDeg} audienceDistM={inputs.audienceDistM}
          coverageWidth3dbM={result.coverageWidth3dbM} rangeMinM={result.rangeMinM} rangeMaxM={result.rangeMaxM}
          unityDistM={result.unityDist6dbM} limitDepthM={result.limitDepthM}
        />
      </div>
    </div>
  );
}
