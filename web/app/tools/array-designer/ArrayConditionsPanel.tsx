import type { CatalogItem } from '@/lib/types';
import { ValidationNote } from './shared';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-20 shrink-0 text-[12.5px] leading-[1.4]" style={{ color: 'var(--nm-text-secondary)' }}>{label}</div>
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

// 條件面板:喇叭(選填,從價目表帶入)／覆蓋角／覆蓋寬度／觀眾席距離 收成一條
// nm-inset 清單。覆蓋角若從價目表帶入,行內加綠字「已從價目表帶入」——這是
// 唯一沿用既有 SpeakerCovSection 邏輯、只換版面的欄位。
export function ArrayConditionsPanel({
  speakers, speakerId, onSpeakerChange, coverageDeg, setCoverageDeg, selectedSpeaker,
  targetWidthM, setTargetWidthM, audienceDistM, setAudienceDistM,
  onReset,
}: {
  speakers: CatalogItem[];
  speakerId: string;
  onSpeakerChange: (id: string) => void;
  coverageDeg: string;
  setCoverageDeg: (v: string) => void;
  selectedSpeaker: CatalogItem | undefined;
  targetWidthM: string;
  setTargetWidthM: (v: string) => void;
  audienceDistM: string;
  setAudienceDistM: (v: string) => void;
  onReset: () => void;
}) {
  const fromCatalog = selectedSpeaker && selectedSpeaker.coverage_h_deg != null;

  return (
    <div className="rounded-[20px]" style={{ background: 'rgba(8,8,10,.4)', border: '1px solid rgba(255,255,255,.13)', boxShadow: 'inset 0 1px 3px rgba(0,0,0,.5)', padding: '20px 22px' }}>
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

        <Row label="覆蓋角">
          <InputShell>
            <input type="number" inputMode="decimal" className="flex-1 min-w-0 bg-transparent text-[13px] outline-none" style={{ color: 'var(--nm-text-body)' }} value={coverageDeg} onChange={(e) => setCoverageDeg(e.target.value)} />
            <span className="shrink-0 text-[13px]" style={{ color: 'var(--nm-text-muted)' }}>°</span>
            {fromCatalog && <span className="shrink-0 text-[11.5px]" style={{ color: 'var(--nm-success-glass-text)' }}>已從價目表帶入</span>}
          </InputShell>
        </Row>
        {selectedSpeaker && selectedSpeaker.coverage_h_deg == null && (
          <ValidationNote message="此品項尚未建檔覆蓋角規格,請查廠商 datasheet 手動輸入。" />
        )}

        <div className="flex gap-2.5">
          <div className="flex-1 min-w-0">
            <div className="text-[11.5px] mb-1.5" style={{ color: 'var(--nm-text-muted)' }}>覆蓋寬度</div>
            <InputShell><input type="number" inputMode="decimal" className="w-full min-w-0 bg-transparent text-[13px] outline-none" style={{ color: 'var(--nm-text-body)' }} value={targetWidthM} onChange={(e) => setTargetWidthM(e.target.value)} /><span className="shrink-0 text-[12.5px]" style={{ color: 'var(--nm-text-muted)' }}>m</span></InputShell>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11.5px] mb-1.5" style={{ color: 'var(--nm-text-muted)' }}>觀眾席距離</div>
            <InputShell><input type="number" inputMode="decimal" className="w-full min-w-0 bg-transparent text-[13px] outline-none" style={{ color: 'var(--nm-text-body)' }} value={audienceDistM} onChange={(e) => setAudienceDistM(e.target.value)} /><span className="shrink-0 text-[12.5px]" style={{ color: 'var(--nm-text-muted)' }}>m</span></InputShell>
          </div>
        </div>
      </div>
    </div>
  );
}
