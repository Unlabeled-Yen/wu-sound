import type { CatalogItem } from '@/lib/types';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-24 shrink-0 text-[12.5px] leading-[1.4]" style={{ color: 'var(--nm-text-secondary)' }}>{label}</div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function InputShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 min-w-0" style={{ minHeight: 40, borderRadius: 13, background: 'rgba(8,8,10,.5)', border: '1px solid rgba(255,255,255,.13)', padding: '0 14px' }}>
      {children}
    </div>
  );
}

// 條件面板:原本三張各自獨立的 nm-raised 卡片(擴大機推力/喇叭規格/演出設定)
// 收成一條 nm-inset 清單——欄位沒有減少,只是不再需要分別找三個標題才看得到
// 彼此關聯的數字。喇叭/擴大機選單維持既有的下拉+手動輸入雙軌,不是新介面。
export function SplConditionsPanel({
  speakers, amps,
  speakerId, onSpeakerChange, speakerSpecNote,
  maxSplDb, onMaxSplChange, refDistanceM, setRefDistanceM, sensitivityDb, setSensitivityDb,
  ampId, onAmpChange, ampSpecNote, ampPowerW, setAmpPowerW,
  targetSplDb, setTargetSplDb, stereoSumDb, setStereoSumDb, dynamicHeadroomDb, setDynamicHeadroomDb, safetyMarginDb, setSafetyMarginDb,
  onReset,
}: {
  speakers: CatalogItem[];
  amps: CatalogItem[];
  speakerId: string;
  onSpeakerChange: (id: string) => void;
  speakerSpecNote: string | null;
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
  onReset: () => void;
}) {
  return (
    <div className="rounded-[20px]" style={{ background: 'rgba(8,8,10,.4)', border: '1px solid rgba(255,255,255,.13)', boxShadow: 'inset 0 1px 3px rgba(0,0,0,.5)', padding: '22px 24px' }}>
      <div className="flex items-baseline justify-between mb-4.5" style={{ marginBottom: 18 }}>
        <div className="text-[15px] font-semibold" style={{ color: 'var(--nm-text-primary)' }}>條件</div>
        <button type="button" onClick={onReset} className="text-[12px]" style={{ color: 'var(--nm-text-secondary)' }}>↺ Reset</button>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {speakers.length > 0 && (
          <Row label="喇叭">
            <InputShell>
              <select className="flex-1 min-w-0 bg-transparent text-[13px] outline-none" style={{ color: 'var(--nm-text-body)' }} value={speakerId} onChange={(e) => onSpeakerChange(e.target.value)}>
                <option value="">— 手動輸入 —</option>
                {speakers.map((s) => <option key={s.id} value={s.id}>{[s.brand, s.name].filter(Boolean).join(' ')}</option>)}
              </select>
            </InputShell>
          </Row>
        )}
        {speakerSpecNote && <p className="text-[12px] pl-[108px]" style={{ color: 'var(--nm-warning-glass-text)' }}>{speakerSpecNote}</p>}

        <div className="flex gap-2.5">
          <div className="flex-1 min-w-0">
            <div className="text-[11.5px] mb-1.5" style={{ color: 'var(--nm-text-muted)' }}>最大音壓(dB)</div>
            <InputShell><input type="number" inputMode="decimal" className="w-full min-w-0 bg-transparent text-[13px] outline-none" style={{ color: 'var(--nm-text-body)' }} value={maxSplDb} onChange={(e) => onMaxSplChange(e.target.value)} /></InputShell>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11.5px] mb-1.5" style={{ color: 'var(--nm-text-muted)' }}>基準距離(m)</div>
            <InputShell><input type="number" inputMode="decimal" className="w-full min-w-0 bg-transparent text-[13px] outline-none" style={{ color: 'var(--nm-text-body)' }} value={refDistanceM} onChange={(e) => setRefDistanceM(e.target.value)} /></InputShell>
          </div>
        </div>

        <Row label="靈敏度">
          <InputShell>
            <input type="number" inputMode="decimal" className="flex-1 min-w-0 bg-transparent text-[13px] outline-none" style={{ color: 'var(--nm-text-body)' }} value={sensitivityDb} onChange={(e) => setSensitivityDb(e.target.value)} placeholder="dB @1W/1m" />
          </InputShell>
        </Row>

        <div style={{ height: 1, background: 'rgba(255,255,255,.07)', margin: '4px 0' }} />

        {amps.length > 0 && (
          <Row label="擴大機">
            <InputShell>
              <select className="flex-1 min-w-0 bg-transparent text-[13px] outline-none" style={{ color: 'var(--nm-text-body)' }} value={ampId} onChange={(e) => onAmpChange(e.target.value)}>
                <option value="">— 手動輸入 —</option>
                {amps.map((a) => <option key={a.id} value={a.id}>{[a.brand, a.name].filter(Boolean).join(' ')}</option>)}
              </select>
            </InputShell>
          </Row>
        )}
        {ampSpecNote && <p className="text-[12px] pl-[108px]" style={{ color: 'var(--nm-warning-glass-text)' }}>{ampSpecNote}</p>}
        <Row label="擴大機功率">
          <InputShell>
            <input type="number" inputMode="decimal" className="flex-1 min-w-0 bg-transparent text-[13px] outline-none" style={{ color: 'var(--nm-text-body)' }} value={ampPowerW} onChange={(e) => setAmpPowerW(e.target.value)} placeholder="W,留空跳過擴大機計算" />
          </InputShell>
        </Row>

        <div style={{ height: 1, background: 'rgba(255,255,255,.07)', margin: '4px 0' }} />

        <Row label="目標音壓">
          <InputShell>
            <input type="number" inputMode="decimal" className="flex-1 min-w-0 bg-transparent text-[13px] outline-none" style={{ color: 'var(--nm-text-body)' }} value={targetSplDb} onChange={(e) => setTargetSplDb(e.target.value)} />
          </InputShell>
        </Row>

        <div className="flex gap-2.5">
          <div className="flex-1 min-w-0">
            <div className="text-[11.5px] mb-1.5" style={{ color: 'var(--nm-text-muted)' }}>聲道疊加</div>
            <InputShell><input type="number" inputMode="decimal" className="flex-1 min-w-0 bg-transparent text-[13px] outline-none" style={{ color: 'var(--nm-text-body)' }} value={stereoSumDb} onChange={(e) => setStereoSumDb(e.target.value)} /></InputShell>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11.5px] mb-1.5" style={{ color: 'var(--nm-text-muted)' }}>演出動態</div>
            <InputShell><input type="number" inputMode="decimal" className="flex-1 min-w-0 bg-transparent text-[13px] outline-none" style={{ color: 'var(--nm-text-body)' }} value={dynamicHeadroomDb} onChange={(e) => setDynamicHeadroomDb(e.target.value)} /></InputShell>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11.5px] mb-1.5" style={{ color: 'var(--nm-text-muted)' }}>安全餘裕</div>
            <InputShell><input type="number" inputMode="decimal" className="flex-1 min-w-0 bg-transparent text-[13px] outline-none" style={{ color: 'var(--nm-text-body)' }} value={safetyMarginDb} onChange={(e) => setSafetyMarginDb(e.target.value)} /></InputShell>
          </div>
        </div>
      </div>
    </div>
  );
}
