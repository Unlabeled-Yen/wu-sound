'use client';

import { useState } from 'react';
import type { AmpDriveResult, AmpMatchResult } from '@/lib/spl-budget';

function fmt(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(digits);
}

const VERDICT_TEXT: Record<AmpMatchResult['verdict'], (gapAbs: string, ampV: string, spkV: string) => string> = {
  underpowered: (gapAbs, ampV) => `推力不足 ${gapAbs} dB,採 ${ampV}`,
  matched: () => `擴大機與喇叭匹配(±1dB 內)`,
  'over-driving': (gapAbs, _ampV, spkV) => `過推 ${gapAbs} dB,採喇叭極限 ${spkV}`,
};
const VERDICT_COLOR: Record<AmpMatchResult['verdict'], string> = {
  underpowered: '#e7ca8c', matched: '#a9e3c1', 'over-driving': '#e5a0a0',
};

// SPL 帶 dB 預算格(§3-3):238px。43.5 dB 三段長條大圖與推力對比條收進「怎麼
// 來的 ▾」——原 8a 的教學內容整段搬進來,版面只留 8px 三段細條 ＋ 一行數字。
// width = value / 43.5 * 100,由 computeSplBudget 的 total(= budgetDb + 動態 + 安全)當分母。
export function SplBudgetCell({
  effectiveMaxSplDb, stereoSumDb, targetSplDb, budgetDb, dynamicHeadroomDb, safetyMarginDb,
  ampDrive, speakerMaxSplDb, ampMatch,
}: {
  effectiveMaxSplDb: number;
  stereoSumDb: number;
  targetSplDb: number;
  budgetDb: number;
  dynamicHeadroomDb: number;
  safetyMarginDb: number;
  ampDrive: AmpDriveResult | null;
  speakerMaxSplDb: number;
  ampMatch: AmpMatchResult | null;
}) {
  const [open, setOpen] = useState(false);
  const denom = 43.5;
  const segWidth = (v: number) => Math.max(0, (v / denom) * 100);

  const verdict = ampMatch ? VERDICT_TEXT[ampMatch.verdict](fmt(Math.abs(ampMatch.gapDb)), fmt(ampDrive?.ampDriveSplDb ?? 0), fmt(speakerMaxSplDb)) : `採喇叭規格值 ${fmt(speakerMaxSplDb)}`;
  const verdictColor = ampMatch ? VERDICT_COLOR[ampMatch.verdict] : '#e7ca8c';

  const scale = ampDrive ? Math.max(ampDrive.ampDriveSplDb, speakerMaxSplDb, 1) : 1;
  const ampPct = ampDrive ? Math.min(100, (ampDrive.ampDriveSplDb / scale) * 100) : 0;
  const spkPct = ampDrive ? Math.min(100, (speakerMaxSplDb / scale) * 100) : 0;

  return (
    <div className="flex-none flex flex-col" style={{ width: 238, borderLeft: '1px solid rgba(255,255,255,.08)', paddingLeft: 20 }}>
      <div className="flex items-center gap-[2px]" style={{ height: 8 }}>
        <div data-budget-seg data-db={budgetDb} style={{ width: `${segWidth(budgetDb)}%`, height: 8, background: 'rgba(95,201,191,.5)', borderRadius: 2 }} />
        <div data-budget-seg data-db={dynamicHeadroomDb} style={{ width: `${segWidth(dynamicHeadroomDb)}%`, height: 8, border: '1.5px solid #d9b56b', background: 'rgba(217,181,107,.14)', borderRadius: 2, boxSizing: 'border-box' }} />
        <div data-budget-seg data-db={safetyMarginDb} style={{ width: `${segWidth(safetyMarginDb)}%`, height: 8, border: '1.5px solid #8098d6', background: 'rgba(128,152,214,.14)', borderRadius: 2, boxSizing: 'border-box' }} />
      </div>
      <div className="flex items-center gap-2.5 mt-1.5 tabular-nums" style={{ font: '400 10.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace' }}>
        <span style={{ color: '#7fd8cd' }}>距離 {fmt(budgetDb)}</span>
        <span style={{ color: '#e7ca8c' }}>動態 {fmt(dynamicHeadroomDb)}</span>
        <span style={{ color: '#a9b8e4' }}>餘裕 {fmt(safetyMarginDb)}</span>
      </div>

      <button type="button" onClick={() => setOpen((v) => !v)} className="text-left mt-1.5 underline w-fit" style={{ font: '400 10.5px/1 "Noto Sans TC",sans-serif', color: '#6d6e73' }}>
        怎麼來的 {open ? '▴' : '▾'}
      </button>
      {open && (
        <div className="mt-2 rounded-lg p-2.5" style={{ background: 'rgba(8,8,10,.4)', border: '1px solid rgba(255,255,255,.11)' }}>
          <div style={{ font: '400 10.5px/1.7 "Noto Sans TC",sans-serif', color: '#8a8b90' }}>
            有效最大音壓 {fmt(effectiveMaxSplDb)} ＋ 聲道疊加 {fmt(stereoSumDb)} － 目標音壓 {fmt(targetSplDb)} ＝ {fmt(budgetDb + dynamicHeadroomDb + safetyMarginDb)} dB 可分配
          </div>
          {ampDrive && ampMatch && (
            <div className="mt-2 flex flex-col gap-1.5">
              <div>
                <div className="flex justify-between tabular-nums" style={{ font: '400 10px/1 "Noto Sans TC",sans-serif', color: '#8a8b90' }}>
                  <span>擴大機可推 @1m</span><span>{fmt(ampDrive.ampDriveSplDb)}</span>
                </div>
                <div style={{ height: 6, marginTop: 3, background: 'rgba(255,255,255,.05)', borderRadius: 2 }}>
                  <div style={{ width: `${ampPct}%`, height: '100%', background: 'rgba(217,181,107,.8)', borderRadius: 2 }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between tabular-nums" style={{ font: '400 10px/1 "Noto Sans TC",sans-serif', color: '#8a8b90' }}>
                  <span>喇叭極限</span><span>{fmt(speakerMaxSplDb)}</span>
                </div>
                <div style={{ height: 6, marginTop: 3, background: 'rgba(255,255,255,.05)', borderRadius: 2 }}>
                  <div style={{ width: `${spkPct}%`, height: '100%', border: '1.5px solid rgba(255,255,255,.35)', boxSizing: 'border-box', borderRadius: 2 }} />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex-1" />
      <div className="flex items-center gap-1.5">
        <span className="block" style={{ width: 5, height: 5, borderRadius: 999, background: verdictColor }} />
        <span style={{ font: '400 10.5px/1 "Noto Sans TC",sans-serif', color: verdictColor }}>{verdict}</span>
      </div>
    </div>
  );
}
