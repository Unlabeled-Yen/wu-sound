import type { AmpDriveResult, AmpMatchResult } from '@/lib/spl-budget';

function fmt(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(digits);
}

const VERDICT_TEXT: Record<AmpMatchResult['verdict'], (gapAbs: string, ampV: string, spkV: string) => string> = {
  underpowered: (gapAbs, ampV) => `推力不足 ${gapAbs} dB　·　距離預算採用推力值 ${ampV} dB,不是喇叭規格值。`,
  matched: () => `擴大機推力與喇叭極限匹配(±1dB 內),距離預算採用喇叭極限值。`,
  'over-driving': (gapAbs, _ampV, spkV) => `過推警告,超出喇叭極限 ${gapAbs} dB——有推爆風險,距離預算已用喇叭極限 ${spkV} dB 做上限。`,
};

// 推力 vs 喇叭極限:取代原本一行文字 verdict,改成兩條共用尺度的長條——
// 讓「這兩個數字差多少」一眼看出來,不用心算。取小值當距離預算的起點。
export function SplDriveVsLimit({ ampDrive, speakerMaxSplDb, ampMatch }: {
  ampDrive: AmpDriveResult | null;
  speakerMaxSplDb: number;
  ampMatch: AmpMatchResult | null;
}) {
  if (!ampDrive || !ampMatch) {
    return (
      <div className="rounded-[20px] nm-raised px-6" style={{ paddingTop: 22, paddingBottom: 22 }}>
        <div className="text-[15px] font-semibold mb-1.5" style={{ color: 'var(--nm-text-primary)' }}>推力 vs 喇叭極限</div>
        <div className="text-[12.5px] leading-[1.7]" style={{ color: 'var(--nm-text-secondary)' }}>
          尚未填擴大機功率,距離預算直接採用喇叭規格的最大音壓 {fmt(speakerMaxSplDb)} dB。填了擴大機功率會改成取兩者較小值。
        </div>
      </div>
    );
  }

  const scale = Math.max(ampDrive.ampDriveSplDb, speakerMaxSplDb, 1);
  const ampPct = Math.min(100, (ampDrive.ampDriveSplDb / scale) * 100);
  const spkPct = Math.min(100, (speakerMaxSplDb / scale) * 100);
  const gapAbs = fmt(Math.abs(ampMatch.gapDb));
  const verdictText = VERDICT_TEXT[ampMatch.verdict](gapAbs, fmt(ampDrive.ampDriveSplDb), fmt(speakerMaxSplDb));
  const verdictColor = ampMatch.verdict === 'matched' ? 'var(--nm-success-glass-text)' : ampMatch.verdict === 'over-driving' ? 'var(--nm-danger-glass-text)' : 'var(--nm-warning-glass-text)';
  const verdictBg = ampMatch.verdict === 'matched' ? 'rgba(126,207,157,.08)' : ampMatch.verdict === 'over-driving' ? 'rgba(224,122,122,.08)' : 'rgba(217,181,107,.08)';
  const verdictBorder = ampMatch.verdict === 'matched' ? 'rgba(126,207,157,.28)' : ampMatch.verdict === 'over-driving' ? 'rgba(224,122,122,.28)' : 'rgba(217,181,107,.28)';

  return (
    <div className="rounded-[20px] nm-raised px-6" style={{ paddingTop: 22, paddingBottom: 22 }}>
      <div className="text-[15px] font-semibold mb-1.5" style={{ color: 'var(--nm-text-primary)' }}>推力 vs 喇叭極限</div>
      <div className="text-[12.5px] leading-[1.7] mb-5" style={{ color: 'var(--nm-text-secondary)' }}>取小值當距離預算的起點。</div>

      <div className="grid gap-3.5">
        <div>
          <div className="flex justify-between text-[12.5px] mb-1.5" style={{ color: 'var(--nm-text-body)' }}>
            <span>擴大機可推 @1m</span><span style={{ fontWeight: 600 }}>{fmt(ampDrive.ampDriveSplDb)} dB</span>
          </div>
          <div style={{ height: 14, background: 'rgba(255,255,255,.05)', borderRadius: 3 }}>
            <div style={{ width: `${ampPct}%`, height: '100%', background: 'rgba(217,181,107,.8)', borderRadius: 3 }} />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-[12.5px] mb-1.5" style={{ color: 'var(--nm-text-body)' }}>
            <span>喇叭極限</span><span style={{ fontWeight: 600 }}>{fmt(speakerMaxSplDb)} dB</span>
          </div>
          <div style={{ height: 14, background: 'rgba(255,255,255,.05)', borderRadius: 3 }}>
            <div style={{ width: `${spkPct}%`, height: '100%', border: '1.5px solid rgba(255,255,255,.35)', background: 'rgba(255,255,255,.06)', borderRadius: 3, boxSizing: 'border-box' }} />
          </div>
        </div>
      </div>

      <div className="mt-4 px-3.5 py-3 rounded-[13px] text-[12.5px] leading-[1.7]" style={{ background: verdictBg, border: `1px solid ${verdictBorder}`, color: verdictColor }}>
        {verdictText}
      </div>
    </div>
  );
}
