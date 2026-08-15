'use client';

import { useMemo, useState } from 'react';
import {
  computeSplBudget,
  distanceAttenuationDb,
  computeAmpDrive,
  evaluateAmpMatch,
} from '@/lib/spl-budget';
import type { CatalogItem } from '@/lib/types';
import { SplAnswerBand } from './SplAnswerBand';
import { SplBudgetBreakdown } from './SplBudgetBreakdown';
import { SplDriveVsLimit } from './SplDriveVsLimit';
import { SplConditionsPanel } from './SplConditionsPanel';
import { SplHandoffBanner } from './SplHandoffBanner';

interface Props {
  speakers: CatalogItem[];
  amps: CatalogItem[];
}

// 答案先行:最終數字(建議投射距離)放最上面獨佔最大字級,條件收成一區在下面,
// 公式本身畫成長條圖——計算邏輯完全不動(見 lib/spl-budget.ts),只是重排版面。
export default function SplCalculatorForm({ speakers, amps }: Props) {
  const [speakerId, setSpeakerId] = useState<string>('');
  const [maxSplDb, setMaxSplDb] = useState('136');
  const [maxSplTouched, setMaxSplTouched] = useState(false); // 使用者手動改過就不再被擴大機推力覆蓋
  const [refDistanceM, setRefDistanceM] = useState('1');
  const [sensitivityDb, setSensitivityDb] = useState('');
  const [speakerSpecNote, setSpeakerSpecNote] = useState<string | null>(null);

  const [ampId, setAmpId] = useState<string>('');
  const [ampPowerW, setAmpPowerW] = useState('');
  const [ampSpecNote, setAmpSpecNote] = useState<string | null>(null);

  const [targetSplDb, setTargetSplDb] = useState('90');
  const [stereoSumDb, setStereoSumDb] = useState('3');
  const [dynamicHeadroomDb, setDynamicHeadroomDb] = useState('12');
  const [safetyMarginDb, setSafetyMarginDb] = useState('6');
  const [checkDistanceM, setCheckDistanceM] = useState('15');

  function onSpeakerChange(id: string) {
    setSpeakerId(id);
    if (!id) {
      setSpeakerSpecNote(null);
      return;
    }
    const item = speakers.find((s) => s.id === id);
    if (!item) return;
    const missing: string[] = [];
    if (item.max_spl_db != null && item.spl_ref_distance_m != null) {
      setMaxSplDb(String(item.max_spl_db));
      setRefDistanceM(String(item.spl_ref_distance_m));
      setMaxSplTouched(false);
    } else {
      missing.push('最大音壓/基準距離');
    }
    if (item.sensitivity_db_1w1m != null) {
      setSensitivityDb(String(item.sensitivity_db_1w1m));
    } else {
      missing.push('靈敏度');
    }
    setSpeakerSpecNote(missing.length ? `此品項尚未建檔:${missing.join('、')},請手動輸入。` : null);
  }

  function onAmpChange(id: string) {
    setAmpId(id);
    if (!id) {
      setAmpSpecNote(null);
      return;
    }
    const item = amps.find((a) => a.id === id);
    if (!item) return;
    if (item.amp_power_w != null) {
      setAmpPowerW(String(item.amp_power_w));
      setAmpSpecNote(null);
    } else {
      setAmpSpecNote('此擴大機尚未建檔功率,請手動輸入。');
    }
  }

  function onMaxSplChange(next: string) {
    setMaxSplDb(next);
    setMaxSplTouched(true);
  }

  function resetAll() {
    setSpeakerId(''); setMaxSplDb('136'); setMaxSplTouched(false); setRefDistanceM('1'); setSensitivityDb(''); setSpeakerSpecNote(null);
    setAmpId(''); setAmpPowerW(''); setAmpSpecNote(null);
    setTargetSplDb('90'); setStereoSumDb('3'); setDynamicHeadroomDb('12'); setSafetyMarginDb('6'); setCheckDistanceM('15');
  }

  const ampDrive = useMemo(() => {
    const s = Number(sensitivityDb);
    const p = Number(ampPowerW);
    if (!Number.isFinite(s) || !Number.isFinite(p)) return null;
    return computeAmpDrive({ sensitivityDb: s, ampPowerW: p });
  }, [sensitivityDb, ampPowerW]);

  const speakerMaxNum = Number(maxSplDb);
  const ampMatch = useMemo(() => {
    if (!ampDrive || !Number.isFinite(speakerMaxNum)) return null;
    return evaluateAmpMatch({ ampDriveSplDb: ampDrive.ampDriveSplDb, speakerMaxSplDb: speakerMaxNum });
  }, [ampDrive, speakerMaxNum]);

  // 「有效最大音壓」= 擴大機推力 vs 喇叭極限取較小值。用它進距離預算。
  const effectiveMaxSplDb = ampMatch ? ampMatch.effectiveMaxSplDb : speakerMaxNum;

  const input = useMemo(
    () => ({
      maxSplDb: effectiveMaxSplDb,
      refDistanceM: Number(refDistanceM),
      targetSplDb: Number(targetSplDb),
      stereoSumDb: Number(stereoSumDb),
      dynamicHeadroomDb: Number(dynamicHeadroomDb),
      safetyMarginDb: Number(safetyMarginDb),
    }),
    [effectiveMaxSplDb, refDistanceM, targetSplDb, stereoSumDb, dynamicHeadroomDb, safetyMarginDb],
  );

  const inputsValid = Object.values(input).every((n) => Number.isFinite(n));
  const result = useMemo(() => (inputsValid ? computeSplBudget(input) : null), [inputsValid, input]);

  const checkDistanceNum = Number(checkDistanceM);
  const hasCheckDistance = checkDistanceM.trim() !== '' && Number.isFinite(checkDistanceNum) && checkDistanceNum > 0;
  const checkAttenuation =
    hasCheckDistance && result ? distanceAttenuationDb(checkDistanceNum, input.refDistanceM) : null;
  const checkPasses = checkAttenuation !== null && result ? checkAttenuation <= result.budgetDb : null;

  const conditionsPanel = (
    <SplConditionsPanel
      speakers={speakers} amps={amps}
      speakerId={speakerId} onSpeakerChange={onSpeakerChange} speakerSpecNote={speakerSpecNote}
      maxSplDb={maxSplDb} onMaxSplChange={onMaxSplChange} refDistanceM={refDistanceM} setRefDistanceM={setRefDistanceM}
      sensitivityDb={sensitivityDb} setSensitivityDb={setSensitivityDb}
      ampId={ampId} onAmpChange={onAmpChange} ampSpecNote={ampSpecNote} ampPowerW={ampPowerW} setAmpPowerW={setAmpPowerW}
      targetSplDb={targetSplDb} setTargetSplDb={setTargetSplDb}
      stereoSumDb={stereoSumDb} setStereoSumDb={setStereoSumDb}
      dynamicHeadroomDb={dynamicHeadroomDb} setDynamicHeadroomDb={setDynamicHeadroomDb}
      safetyMarginDb={safetyMarginDb} setSafetyMarginDb={setSafetyMarginDb}
      onReset={resetAll}
    />
  );

  // 輸入無效或計算例外時,答案區塊本身隱藏(不留殘留數字),提示搬到原本答案帶的位置。
  if (!result || result.theoreticalMaxThrowM <= 0) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-[20px] nm-raised-sm px-6 py-6">
          <p className="text-[13px]" style={{ color: 'var(--nm-warning-glass-text)' }}>
            {!inputsValid ? '請確認所有欄位都是有效數字。' : (result?.warnings[0] ?? '預算不足,無法達到目標音壓——請重新檢視音壓需求或器材規格。')}
          </p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{conditionsPanel}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SplAnswerBand
        recommendedM={result.recommendedMaxThrowM}
        theoreticalM={result.theoreticalMaxThrowM}
        budgetDb={result.budgetDb}
        refDistanceM={input.refDistanceM}
        checkDistanceM={hasCheckDistance ? checkDistanceNum : null}
        checkAttenuationDb={checkAttenuation}
        checkPasses={checkPasses}
      />

      <SplBudgetBreakdown
        effectiveMaxSplDb={effectiveMaxSplDb}
        stereoSumDb={input.stereoSumDb}
        targetSplDb={input.targetSplDb}
        budgetDb={result.budgetDb}
        dynamicHeadroomDb={input.dynamicHeadroomDb}
        safetyMarginDb={input.safetyMarginDb}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SplDriveVsLimit ampDrive={ampDrive} speakerMaxSplDb={speakerMaxNum} ampMatch={ampMatch} />
        {conditionsPanel}
      </div>

      <div className="rounded-[20px] nm-raised px-5 py-4">
        <label className="flex items-center gap-3 flex-wrap">
          <span className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>驗算特定距離(選填,公尺)</span>
          <input
            type="number"
            inputMode="decimal"
            className="nm-input"
            style={{ width: 120 }}
            value={checkDistanceM}
            onChange={(e) => setCheckDistanceM(e.target.value)}
          />
        </label>
      </div>

      <SplHandoffBanner speakerId={speakerId} recommendedM={result.recommendedMaxThrowM} />
    </div>
  );
}
