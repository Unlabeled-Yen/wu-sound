'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  computeSplBudget,
  distanceAttenuationDb,
  computeAmpDrive,
  evaluateAmpMatch,
} from '@/lib/spl-budget';
import type { CatalogItem } from '@/lib/types';
import { SplAnswerCell } from './SplAnswerCell';
import { SplRulerCell } from './SplRulerCell';
import { SplBudgetCell } from './SplBudgetCell';
import { SplInputsCell } from './SplInputsCell';

interface Props {
  speakers: CatalogItem[];
  amps: CatalogItem[];
  initialSpeakerId?: string;
  onRecommendedChange?: (v: { speakerId: string; recommendedM: number | null }) => void;
}

// SPL 儀表帶(16-acoustic-merged.md §3):132px 固定高、四格。計算邏輯完全不動
// (lib/spl-budget.ts,見 §2 表),只是把舊版 SplCalculatorForm 的直立卡片版面
// 壓成一條橫帶。onRecommendedChange 讓外層(AcousticWorkbench)知道現在算出的
// 喇叭/建議距離,給陣列面板當跨工具帶入值——兩支工具現在同頁,不用再走 URL。
export function SplBudgetBand({ speakers, amps, initialSpeakerId, onRecommendedChange }: Props) {
  const [speakerId, setSpeakerId] = useState('');
  const [maxSplDb, setMaxSplDb] = useState('136');
  const [refDistanceM, setRefDistanceM] = useState('1');
  const [sensitivityDb, setSensitivityDb] = useState('');
  const [speakerSpecNote, setSpeakerSpecNote] = useState<string | null>(null);

  const [ampId, setAmpId] = useState('');
  const [ampPowerW, setAmpPowerW] = useState('');
  const [ampSpecNote, setAmpSpecNote] = useState<string | null>(null);

  const [targetSplDb, setTargetSplDb] = useState('90');
  const [stereoSumDb, setStereoSumDb] = useState('3');
  const [dynamicHeadroomDb, setDynamicHeadroomDb] = useState('12');
  const [safetyMarginDb, setSafetyMarginDb] = useState('6');
  const [checkDistanceM, setCheckDistanceM] = useState('15');

  function onSpeakerChange(id: string) {
    setSpeakerId(id);
    if (!id) { setSpeakerSpecNote(null); return; }
    const item = speakers.find((s) => s.id === id);
    if (!item) return;
    const missing: string[] = [];
    if (item.max_spl_db != null && item.spl_ref_distance_m != null) {
      setMaxSplDb(String(item.max_spl_db));
      setRefDistanceM(String(item.spl_ref_distance_m));
    } else {
      missing.push('最大音壓/基準距離');
    }
    if (item.sensitivity_db_1w1m != null) setSensitivityDb(String(item.sensitivity_db_1w1m));
    else missing.push('靈敏度');
    setSpeakerSpecNote(missing.length ? `此品項尚未建檔:${missing.join('、')},請手動輸入。` : null);
  }

  function onAmpChange(id: string) {
    setAmpId(id);
    if (!id) { setAmpSpecNote(null); return; }
    const item = amps.find((a) => a.id === id);
    if (!item) return;
    if (item.amp_power_w != null) { setAmpPowerW(String(item.amp_power_w)); setAmpSpecNote(null); }
    else setAmpSpecNote('此擴大機尚未建檔功率,請手動輸入。');
  }

  function onReset() {
    setSpeakerId(''); setMaxSplDb('136'); setRefDistanceM('1'); setSensitivityDb(''); setSpeakerSpecNote(null);
    setAmpId(''); setAmpPowerW(''); setAmpSpecNote(null);
    setTargetSplDb('90'); setStereoSumDb('3'); setDynamicHeadroomDb('12'); setSafetyMarginDb('6'); setCheckDistanceM('15');
  }

  useEffect(() => {
    if (initialSpeakerId && speakers.some((s) => s.id === initialSpeakerId)) onSpeakerChange(initialSpeakerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const checkAttenuation = hasCheckDistance && result ? distanceAttenuationDb(checkDistanceNum, input.refDistanceM) : null;
  const checkPasses = checkAttenuation !== null && result ? checkAttenuation <= result.budgetDb : null;
  const marginDb = checkAttenuation !== null && result ? result.budgetDb - checkAttenuation : null;

  const selectedSpeaker = speakers.find((s) => s.id === speakerId);
  const selectedSpeakerLabel = selectedSpeaker ? [selectedSpeaker.brand, selectedSpeaker.name].filter(Boolean).join(' ') : '手動輸入';

  useEffect(() => {
    onRecommendedChange?.({ speakerId, recommendedM: result && result.theoreticalMaxThrowM > 0 ? result.recommendedMaxThrowM : null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speakerId, result?.recommendedMaxThrowM]);

  const bandStyle: React.CSSProperties = { height: 132, borderRadius: 16, background: 'rgba(19,19,23,.5)', border: '1px solid rgba(255,255,255,.13)', padding: '14px 20px' };

  if (!result || result.theoreticalMaxThrowM <= 0) {
    return (
      <div className="flex-none flex items-center" style={bandStyle}>
        <p style={{ font: '400 12.5px/1.5 "Noto Sans TC",sans-serif', color: '#e5a0a0' }}>
          {!inputsValid ? '請確認所有欄位都是有效數字。' : (result?.warnings[0] ?? '預算不足,無法達到目標音壓——請重新檢視音壓需求或器材規格。')}
        </p>
      </div>
    );
  }

  return (
    <div className="flex-none flex items-stretch" style={bandStyle}>
      <SplAnswerCell
        recommendedM={result.recommendedMaxThrowM}
        theoreticalM={result.theoreticalMaxThrowM}
        checkDistanceM={hasCheckDistance ? checkDistanceNum : null}
        checkPasses={checkPasses}
        marginDb={marginDb}
      />
      <SplRulerCell
        recommendedM={result.recommendedMaxThrowM}
        theoreticalM={result.theoreticalMaxThrowM}
        checkDistanceM={hasCheckDistance ? checkDistanceNum : null}
      />
      <SplBudgetCell
        effectiveMaxSplDb={effectiveMaxSplDb}
        stereoSumDb={input.stereoSumDb}
        targetSplDb={input.targetSplDb}
        budgetDb={result.budgetDb}
        dynamicHeadroomDb={input.dynamicHeadroomDb}
        safetyMarginDb={input.safetyMarginDb}
        ampDrive={ampDrive}
        speakerMaxSplDb={speakerMaxNum}
        ampMatch={ampMatch}
      />
      <SplInputsCell
        speakers={speakers} amps={amps}
        speakerId={speakerId} onSpeakerChange={onSpeakerChange} speakerSpecNote={speakerSpecNote} selectedSpeakerLabel={selectedSpeakerLabel}
        maxSplDb={maxSplDb} onMaxSplChange={setMaxSplDb} refDistanceM={refDistanceM} setRefDistanceM={setRefDistanceM}
        sensitivityDb={sensitivityDb} setSensitivityDb={setSensitivityDb}
        ampId={ampId} onAmpChange={onAmpChange} ampSpecNote={ampSpecNote} ampPowerW={ampPowerW} setAmpPowerW={setAmpPowerW}
        targetSplDb={targetSplDb} setTargetSplDb={setTargetSplDb}
        stereoSumDb={stereoSumDb} setStereoSumDb={setStereoSumDb}
        dynamicHeadroomDb={dynamicHeadroomDb} setDynamicHeadroomDb={setDynamicHeadroomDb}
        safetyMarginDb={safetyMarginDb} setSafetyMarginDb={setSafetyMarginDb}
        checkDistanceM={checkDistanceM} setCheckDistanceM={setCheckDistanceM}
        onReset={onReset}
      />
    </div>
  );
}
