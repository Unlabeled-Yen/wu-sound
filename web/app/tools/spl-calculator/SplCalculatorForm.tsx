'use client';

import { useMemo, useState } from 'react';
import {
  computeSplBudget,
  distanceAttenuationDb,
  computeAmpDrive,
  evaluateAmpMatch,
  type AmpMatchVerdict,
} from '@/lib/spl-budget';
import type { CatalogItem } from '@/lib/types';

interface Props {
  speakers: CatalogItem[];
  amps: CatalogItem[];
}

function fmt(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '-';
  return n.toFixed(digits);
}

const VERDICT_LABEL: Record<AmpMatchVerdict, string> = {
  underpowered: '推力不足',
  matched: '匹配',
  'over-driving': '過推警告',
};

const VERDICT_COLOR: Record<AmpMatchVerdict, string> = {
  underpowered: 'var(--nm-warning-glass-text)',
  matched: 'var(--nm-success-glass-text)',
  'over-driving': 'var(--nm-danger-glass-text)',
};

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
  const [checkDistanceM, setCheckDistanceM] = useState('');

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

  function onMaxSplChange(next: string) {
    setMaxSplDb(next);
    setMaxSplTouched(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="nm-raised rounded-2xl p-4 space-y-3">
        <h2 className="text-[15px] font-semibold" style={{ color: 'var(--nm-text-primary)' }}>
          擴大機推力(選填)
        </h2>
        <p className="text-[12px]" style={{ color: 'var(--nm-text-muted)' }}>
          填了會用「靈敏度 + 10·log(瓦數)」推算實際可達 SPL,並跟喇叭極限取小值當距離預算的起點。
        </p>
        {amps.length > 0 && (
          <label className="grid gap-1">
            <span className="text-sm" style={{ color: 'var(--nm-text-secondary)' }}>從價目表帶入(選填)</span>
            <select className="nm-input w-full" value={ampId} onChange={(e) => onAmpChange(e.target.value)}>
              <option value="">— 手動輸入 —</option>
              {amps.map((a) => (
                <option key={a.id} value={a.id}>
                  {[a.brand, a.name].filter(Boolean).join(' ')}
                </option>
              ))}
            </select>
          </label>
        )}
        {ampSpecNote && (
          <p className="text-[12px]" style={{ color: 'var(--nm-warning-glass-text)' }}>{ampSpecNote}</p>
        )}
        <label className="grid gap-1">
          <span className="text-sm" style={{ color: 'var(--nm-text-secondary)' }}>擴大機功率(W,實際負載下)</span>
          <input
            type="number"
            inputMode="decimal"
            className="nm-input w-full"
            value={ampPowerW}
            onChange={(e) => setAmpPowerW(e.target.value)}
            placeholder="留空則跳過"
          />
        </label>
        {ampDrive && (
          <div className="nm-inset rounded-xl p-3 space-y-1">
            <div className="text-[11px]" style={{ color: 'var(--nm-text-muted)' }}>擴大機可推 SPL @1m</div>
            <div className="text-lg font-semibold" style={{ color: 'var(--nm-text-primary)' }}>
              {fmt(ampDrive.ampDriveSplDb, 2)} dB
            </div>
            {ampMatch && (
              <div className="text-[13px] pt-1" style={{ color: VERDICT_COLOR[ampMatch.verdict] }}>
                {VERDICT_LABEL[ampMatch.verdict]} · 差 {fmt(ampMatch.gapDb, 2)} dB
                {ampMatch.verdict === 'over-driving' && ' — 有推爆喇叭風險,已用喇叭極限做上限'}
                {ampMatch.verdict === 'underpowered' && ' — 距離預算會用推力值,不是喇叭規格值'}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="nm-raised rounded-2xl p-4 space-y-3">
        <h2 className="text-[15px] font-semibold" style={{ color: 'var(--nm-text-primary)' }}>
          喇叭規格
        </h2>
        {speakers.length > 0 && (
          <label className="grid gap-1">
            <span className="text-sm" style={{ color: 'var(--nm-text-secondary)' }}>從價目表帶入(選填)</span>
            <select
              className="nm-input w-full"
              value={speakerId}
              onChange={(e) => onSpeakerChange(e.target.value)}
            >
              <option value="">— 手動輸入 —</option>
              {speakers.map((s) => (
                <option key={s.id} value={s.id}>
                  {[s.brand, s.name].filter(Boolean).join(' ')}
                </option>
              ))}
            </select>
          </label>
        )}
        {speakerSpecNote && (
          <p className="text-[12px]" style={{ color: 'var(--nm-warning-glass-text)' }}>
            {speakerSpecNote}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1">
            <span className="text-sm" style={{ color: 'var(--nm-text-secondary)' }}>最大音壓(dB SPL)</span>
            <input
              type="number"
              inputMode="decimal"
              className="nm-input w-full"
              value={maxSplDb}
              onChange={(e) => onMaxSplChange(e.target.value)}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm" style={{ color: 'var(--nm-text-secondary)' }}>基準距離(m)</span>
            <input
              type="number"
              inputMode="decimal"
              className="nm-input w-full"
              value={refDistanceM}
              onChange={(e) => setRefDistanceM(e.target.value)}
            />
          </label>
        </div>
        <label className="grid gap-1">
          <span className="text-sm" style={{ color: 'var(--nm-text-secondary)' }}>靈敏度(dB @1W/1m,擴大機計算用)</span>
          <input
            type="number"
            inputMode="decimal"
            className="nm-input w-full"
            value={sensitivityDb}
            onChange={(e) => setSensitivityDb(e.target.value)}
            placeholder="留空則跳過擴大機計算"
          />
        </label>
        {ampMatch && (
          <div className="text-[12px] pt-1" style={{ color: 'var(--nm-text-muted)' }}>
            實際採用的最大音壓 = {fmt(effectiveMaxSplDb, 2)} dB
            {!maxSplTouched && ampMatch.verdict === 'underpowered' && '(取自擴大機推力)'}
          </div>
        )}
      </section>

      <section className="nm-raised rounded-2xl p-4 space-y-3">
        <h2 className="text-[15px] font-semibold" style={{ color: 'var(--nm-text-primary)' }}>
          演出設定
        </h2>
        <label className="grid gap-1">
          <span className="text-sm" style={{ color: 'var(--nm-text-secondary)' }}>目標音壓(dB SPL)</span>
          <input
            type="number"
            inputMode="decimal"
            className="nm-input w-full"
            value={targetSplDb}
            onChange={(e) => setTargetSplDb(e.target.value)}
          />
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label className="grid gap-1">
            <span className="text-sm" style={{ color: 'var(--nm-text-secondary)' }}>聲道疊加</span>
            <input
              type="number"
              inputMode="decimal"
              className="nm-input w-full"
              value={stereoSumDb}
              onChange={(e) => setStereoSumDb(e.target.value)}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm" style={{ color: 'var(--nm-text-secondary)' }}>演出動態</span>
            <input
              type="number"
              inputMode="decimal"
              className="nm-input w-full"
              value={dynamicHeadroomDb}
              onChange={(e) => setDynamicHeadroomDb(e.target.value)}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm" style={{ color: 'var(--nm-text-secondary)' }}>安全餘裕</span>
            <input
              type="number"
              inputMode="decimal"
              className="nm-input w-full"
              value={safetyMarginDb}
              onChange={(e) => setSafetyMarginDb(e.target.value)}
            />
          </label>
        </div>
      </section>

      {result && (
        <section className="nm-raised-lg rounded-2xl p-5 space-y-4">
          <div>
            <div className="text-[12px]" style={{ color: 'var(--nm-text-muted)' }}>距離衰減預算</div>
            <div className="text-3xl font-semibold" style={{ color: 'var(--nm-text-primary)' }}>
              {fmt(result.budgetDb)} dB
            </div>
          </div>
          {result.theoreticalMaxThrowM > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="nm-inset rounded-xl p-3">
                <div className="text-[11px]" style={{ color: 'var(--nm-text-muted)' }}>理論最大距離</div>
                <div className="text-lg font-semibold" style={{ color: 'var(--nm-text-primary)' }}>
                  {fmt(result.theoreticalMaxThrowM)} m
                </div>
              </div>
              <div className="nm-inset rounded-xl p-3">
                <div className="text-[11px]" style={{ color: 'var(--nm-text-muted)' }}>建議距離(9 折)</div>
                <div className="text-lg font-semibold" style={{ color: 'var(--nm-success-glass-text)' }}>
                  {fmt(result.recommendedMaxThrowM)} m
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm" style={{ color: 'var(--nm-danger-glass-text)' }}>
              預算不足,無法達到目標音壓。
            </p>
          )}

          <div className="space-y-1">
            {result.warnings.map((w, i) => (
              <p key={i} className="text-[12px]" style={{ color: 'var(--nm-text-muted)' }}>
                ⚠ {w}
              </p>
            ))}
          </div>

          <div className="pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <label className="grid gap-1">
              <span className="text-sm" style={{ color: 'var(--nm-text-secondary)' }}>驗算特定距離(選填,公尺)</span>
              <input
                type="number"
                inputMode="decimal"
                className="nm-input w-40"
                value={checkDistanceM}
                onChange={(e) => setCheckDistanceM(e.target.value)}
              />
            </label>
            {hasCheckDistance && checkAttenuation !== null && (
              <p
                className="text-sm mt-2"
                style={{ color: checkPasses ? 'var(--nm-success-glass-text)' : 'var(--nm-danger-glass-text)' }}
              >
                {fmt(checkDistanceNum, 0)}m 衰減 {fmt(checkAttenuation)}dB,
                {checkPasses ? '在預算內,達標。' : `超出預算 ${fmt(checkAttenuation - result.budgetDb)}dB,不達標。`}
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
