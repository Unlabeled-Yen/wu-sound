'use client';

import { useState } from 'react';
import type { CatalogItem } from '@/lib/types';

function Row({ label, value, fullWidth, valueColor }: { label: string; value: string; fullWidth?: boolean; valueColor?: string }) {
  return (
    <div
      className={fullWidth ? 'flex items-center' : 'flex-1 min-w-0 flex items-center'}
      style={{ minHeight: 26, padding: '0 9px', borderRadius: 7, background: 'rgba(8,8,10,.4)', border: '1px solid rgba(255,255,255,.11)' }}
    >
      <span className="flex-1 truncate" style={{ font: '400 10.5px/1 "Noto Sans TC",sans-serif', color: '#8a8b90' }}>{label}</span>
      <span className="tabular-nums truncate" style={{ font: '400 10.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace', color: valueColor ?? '#e4e4e7' }}>{value}</span>
    </div>
  );
}

function EditField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="flex-1 min-w-0">
      <div style={{ font: '400 9.5px/1 "Noto Sans TC",sans-serif', color: '#6d6e73', marginBottom: 3 }}>{label}</div>
      <input
        type="number"
        inputMode="decimal"
        className="w-full min-w-0 bg-transparent outline-none tabular-nums"
        style={{ font: '400 10.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace', color: '#e4e4e7', height: 24, borderRadius: 6, border: '1px solid rgba(255,255,255,.13)', padding: '0 7px' }}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// SPL 帶條件格(§3-4):270px,三列 26px 高唯讀摘要 + eyebrow 右側「價目表 ▾　↺」
// 收合出完整可編輯表單(喇叭/擴大機下拉 + 全部 dB 數字)。26px 唯讀列是桌機
// 固定版專用,<1024px 一律回到 40px(commit 4 的手機退場再處理)。
export function SplInputsCell({
  speakers, amps,
  speakerId, onSpeakerChange, speakerSpecNote, selectedSpeakerLabel,
  maxSplDb, onMaxSplChange, refDistanceM, setRefDistanceM, sensitivityDb, setSensitivityDb,
  ampId, onAmpChange, ampSpecNote, ampPowerW, setAmpPowerW,
  targetSplDb, setTargetSplDb, stereoSumDb, setStereoSumDb, dynamicHeadroomDb, setDynamicHeadroomDb, safetyMarginDb, setSafetyMarginDb,
  checkDistanceM, setCheckDistanceM,
  onReset,
}: {
  speakers: CatalogItem[];
  amps: CatalogItem[];
  speakerId: string;
  onSpeakerChange: (id: string) => void;
  speakerSpecNote: string | null;
  selectedSpeakerLabel: string;
  maxSplDb: string;
  onMaxSplChange: (v: string) => void;
  refDistanceM: string;
  setRefDistanceM: (v: string) => void;
  sensitivityDb: string;
  setSensitivityDb: (v: string) => void;
  ampId: string;
  onAmpChange: (id: string) => void;
  ampSpecNote: string | null;
  ampPowerW: string;
  setAmpPowerW: (v: string) => void;
  targetSplDb: string;
  setTargetSplDb: (v: string) => void;
  stereoSumDb: string;
  setStereoSumDb: (v: string) => void;
  dynamicHeadroomDb: string;
  setDynamicHeadroomDb: (v: string) => void;
  safetyMarginDb: string;
  setSafetyMarginDb: (v: string) => void;
  checkDistanceM: string;
  setCheckDistanceM: (v: string) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex-none relative flex flex-col gap-[5px]" style={{ width: 270, borderLeft: '1px solid rgba(255,255,255,.08)', paddingLeft: 20 }}>
      <div className="flex items-center justify-between">
        <span className="uppercase" style={{ font: '400 10px/1 "Noto Sans TC",sans-serif', letterSpacing: '.16em', color: '#6d6e73' }}>條件</span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setOpen((v) => !v)} className="underline" style={{ font: '400 10.5px/1 "Noto Sans TC",sans-serif', color: '#8a8b90' }}>
            價目表 {open ? '▴' : '▾'}
          </button>
          <button type="button" onClick={onReset} aria-label="重設" style={{ font: '400 11px/1 "Noto Sans TC",sans-serif', color: '#8a8b90' }}>↺</button>
        </div>
      </div>

      <Row label="喇叭" value={selectedSpeakerLabel} fullWidth />
      <div className="flex gap-[5px]">
        <Row label="靈敏度" value={sensitivityDb || '—'} />
        <Row label="目標" value={targetSplDb || '—'} />
      </div>
      <div className="flex gap-[5px]">
        <Row label="驗算" value={checkDistanceM ? `${checkDistanceM} m` : '—'} valueColor="#c39ae8" />
        <Row label="疊加" value={stereoSumDb || '—'} />
      </div>

      {/* 絕對定位浮層,理由同 SplBudgetCell 的「怎麼來的 ▾」——SPL 帶只有 132px
          高,展開的完整表單用 flow 排版會被外層 overflow:hidden 裁掉。 */}
      {open && (
        <div className="absolute z-20 flex flex-col gap-2 rounded-lg p-2.5" style={{ top: 24, right: 0, width: 260, background: '#131317', border: '1px solid rgba(255,255,255,.13)', boxShadow: '0 8px 24px rgba(0,0,0,.5)' }}>
          {speakers.length > 0 && (
            <div>
              <div style={{ font: '400 9.5px/1 "Noto Sans TC",sans-serif', color: '#6d6e73', marginBottom: 3 }}>喇叭</div>
              <select
                className="w-full bg-transparent outline-none"
                style={{ font: '400 10.5px/1 "Noto Sans TC",sans-serif', color: '#e4e4e7', height: 24, borderRadius: 6, border: '1px solid rgba(255,255,255,.13)', padding: '0 6px' }}
                value={speakerId}
                onChange={(e) => onSpeakerChange(e.target.value)}
              >
                <option value="">— 手動輸入 —</option>
                {speakers.map((s) => <option key={s.id} value={s.id}>{[s.brand, s.name].filter(Boolean).join(' ')}</option>)}
              </select>
              {speakerSpecNote && <p style={{ font: '400 9.5px/1.5 "Noto Sans TC",sans-serif', color: '#d9b56b', marginTop: 3 }}>{speakerSpecNote}</p>}
            </div>
          )}
          <div className="flex gap-2">
            <EditField label="最大音壓(dB)" value={maxSplDb} onChange={onMaxSplChange} />
            <EditField label="基準距離(m)" value={refDistanceM} onChange={setRefDistanceM} />
          </div>
          <EditField label="靈敏度(dB@1W/1m)" value={sensitivityDb} onChange={setSensitivityDb} />

          {amps.length > 0 && (
            <div>
              <div style={{ font: '400 9.5px/1 "Noto Sans TC",sans-serif', color: '#6d6e73', marginBottom: 3 }}>擴大機</div>
              <select
                className="w-full bg-transparent outline-none"
                style={{ font: '400 10.5px/1 "Noto Sans TC",sans-serif', color: '#e4e4e7', height: 24, borderRadius: 6, border: '1px solid rgba(255,255,255,.13)', padding: '0 6px' }}
                value={ampId}
                onChange={(e) => onAmpChange(e.target.value)}
              >
                <option value="">— 手動輸入 —</option>
                {amps.map((a) => <option key={a.id} value={a.id}>{[a.brand, a.name].filter(Boolean).join(' ')}</option>)}
              </select>
              {ampSpecNote && <p style={{ font: '400 9.5px/1.5 "Noto Sans TC",sans-serif', color: '#d9b56b', marginTop: 3 }}>{ampSpecNote}</p>}
            </div>
          )}
          <EditField label="擴大機功率(W)" value={ampPowerW} onChange={setAmpPowerW} placeholder="留空跳過" />

          <div className="flex gap-2">
            <EditField label="目標音壓" value={targetSplDb} onChange={setTargetSplDb} />
            <EditField label="驗算距離(m)" value={checkDistanceM} onChange={setCheckDistanceM} />
          </div>
          <div className="flex gap-2">
            <EditField label="聲道疊加" value={stereoSumDb} onChange={setStereoSumDb} />
            <EditField label="演出動態" value={dynamicHeadroomDb} onChange={setDynamicHeadroomDb} />
            <EditField label="安全餘裕" value={safetyMarginDb} onChange={setSafetyMarginDb} />
          </div>
        </div>
      )}
    </div>
  );
}
