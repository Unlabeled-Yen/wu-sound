'use client';

import { useEffect, useMemo, useState } from 'react';
import { autoMode, autoModeWithOverride, type ForceQty } from '@/lib/array-designer';
import type { CatalogItem } from '@/lib/types';
import { ErrorNote, ValidationNote, GENERIC_ERROR_MSG, Legend } from './shared';
import ArrayCoverageDiagram from './ArrayCoverageDiagram';
import { ArrayPanelHeader } from './ArrayPanelHeader';
import { ArraySidebar, ArrayConditionInputRow, ArrayConditionRow } from './ArraySidebar';
import { ArrayOverrideCompact } from './ArrayOverrideCompact';
import { ArraySolvePills, type TabKey } from './ArraySolvePills';

const DEFAULTS = { targetWidthM: '20', audienceDistM: '5', forceQty: 'auto' as ForceQty, coverageDeg: '90' };

// 答案先行,計算邏輯完全不動(autoMode/autoModeWithOverride)——16-acoustic-merged.md
// 併頁改版只換版面:條件收進側欄的緊湊輸入列,示意圖換成 ArrayCoverageDiagram
// 的 summary 變體(§2),深度軸搬進標題列右側(§4-1)。
// initialSpeakerId/initialAudienceDistM:SPL 那顆帶過來的跨工具交接值——併頁後
// 兩支工具在同一個畫面,這組 prop 目前仍走掛載時套用一次,之後再考慮直接共用狀態。
export default function AutoModeTab({
  speakers, initialSpeakerId, initialAudienceDistM, active, onChangeTab,
}: {
  speakers: CatalogItem[];
  initialSpeakerId?: string;
  initialAudienceDistM?: string;
  active: TabKey;
  onChangeTab: (key: TabKey) => void;
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
  const [forceQty] = useState<ForceQty>(DEFAULTS.forceQty);
  // null = Auto(系統接管),非 null = 使用者手動覆寫的文字輸入。
  const [spacingOverride, setSpacingOverride] = useState<string | null>(null);
  const [qtyOverride, setQtyOverride] = useState<string | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);

  // 跨工具交接:只在掛載時套用一次,不用 initial 值覆蓋使用者後續的操作。
  useEffect(() => {
    if (initialSpeakerId && speakers.some((s) => s.id === initialSpeakerId)) onSpeakerChange(initialSpeakerId);
    if (initialAudienceDistM) setAudienceDistM(initialAudienceDistM);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const isActive = active === 'auto';
  const conditionsSlot = (
    <>
      {speakers.length > 0 && (
        <ArrayConditionRow label="喇叭" value={selectedSpeaker ? [selectedSpeaker.brand, selectedSpeaker.name].filter(Boolean).join(' ') : '手動輸入'} />
      )}
      <ArrayConditionInputRow label="覆蓋角" value={coverageDeg} onChange={setCoverageDeg} unit="°" color="#8fd0ee" />
      <ArrayConditionInputRow label="覆蓋寬度" value={targetWidthM} onChange={setTargetWidthM} unit="m" />
      <ArrayConditionInputRow label="觀眾席" value={audienceDistM} onChange={setAudienceDistM} unit="m" color="#c39ae8" />
      {selectedSpeaker && selectedSpeaker.coverage_h_deg == null && (
        <ValidationNote message="此品項尚未建檔覆蓋角規格,請查廠商 datasheet 手動輸入。" />
      )}
    </>
  );

  if (!inputsValid || !overridesValid || !result || 'error' in result) {
    return (
      <div style={{ display: isActive ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0, gap: 12 }}>
        <div className="flex-none rounded-xl px-4 py-3" style={{ background: 'rgba(8,8,10,.4)', border: '1px solid rgba(255,255,255,.13)' }}>
          {!inputsValid && <ValidationNote message="請確認覆蓋寬度、觀眾席距離為正數,覆蓋角介於 0~180 度之間。" />}
          {inputsValid && !overridesValid && <ValidationNote message="覆寫的數量需為 ≥1 的整數、覆寫的間距需為正數。" />}
          {result && 'error' in result && <ErrorNote message={result.error} />}
        </div>
        <div className="flex-1 min-h-0 flex gap-3">
          <div className="flex-1" />
          <ArraySidebar
            conditionsSlot={conditionsSlot}
            stats={[]}
            pillsSlot={<ArraySolvePills active={active} onChange={onChangeTab} />}
          />
        </div>
      </div>
    );
  }

  const inRange = inputs.audienceDistM >= result.rangeMinM && inputs.audienceDistM <= result.rangeMaxM;
  const tooClose = inputs.audienceDistM < result.rangeMinM;

  return (
    <div style={{ display: isActive ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0, gap: 12 }}>
      <ArrayPanelHeader
        quantity={result.quantity}
        spacingM={result.spacingM}
        audienceDistM={inputs.audienceDistM}
        inRange={inRange}
        tooClose={tooClose}
        rangeMinM={result.rangeMinM}
        rangeMaxM={result.rangeMaxM}
        limitDepthM={result.limitDepthM}
        legendOpen={legendOpen}
        onToggleLegend={() => setLegendOpen((v) => !v)}
        legendSlot={<Legend />}
      />

      <div className="flex-1 min-h-0 flex gap-3">
        <div className="flex-1 min-w-0 rounded-xl relative overflow-hidden" style={{ border: '1px dashed rgba(255,255,255,.2)', background: 'rgba(8,8,10,.34)' }}>
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
        </div>

        <ArraySidebar
          conditionsSlot={conditionsSlot}
          overrideSlot={
            <ArrayOverrideCompact
              autoQuantity={systemSuggestion?.quantity ?? null}
              autoSpacingM={systemSuggestion?.spacingM ?? null}
              qtyOverride={qtyOverride} setQtyOverride={setQtyOverride}
              spacingOverride={spacingOverride} setSpacingOverride={setSpacingOverride}
            />
          }
          stats={[
            { label: '實際覆蓋 −3dB', value: `${result.coverageWidth3dbM.toFixed(1)} m`, color: '#8fd0ee' },
            { label: 'Unity −6dB', value: `${result.unityDist6dbM.toFixed(1)} m`, color: '#d8bd7a' },
            { label: 'Limit', value: `${result.limitDepthM.toFixed(1)} m`, color: '#8b8f98' },
          ]}
          pillsSlot={<ArraySolvePills active={active} onChange={onChangeTab} />}
        />
      </div>
    </div>
  );
}
