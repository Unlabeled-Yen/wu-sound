'use client';

import { useState } from 'react';
import {
  daysLeft,
  daysToXPct,
  budgetToYPct,
  RADAR_Y_TICKS_TWD,
  type TenderHit,
} from './shared';

// 開標視窗雷達(07-視覺校正指南 §3.4-4)。目前只做座標(x=距截止日天數,
// y=預算取對數),圓點固定大小——「勝率」需要 Wu 自己過去投標決策的中標
// 記錄,tender-radar 目前沒有這份資料,先不做,不能拿對手檔案的
// award_count 冒充「Wu 的勝率」(語意不同,見對手檔案元件的同類警告)。

const HEIGHT = 236;
const LEFT_AXIS = 44;
const DOT_SIZE = 16;

interface Point {
  hit: TenderHit;
  days: number;
  budgetTwd: number;
  xPct: number;
  yPct: number;
}

function fmtBudget(twd: number): string {
  if (twd >= 10_000) return `${(twd / 10_000).toLocaleString('zh-TW', { maximumFractionDigits: 1 })} 萬`;
  return `${twd.toLocaleString('zh-TW')}`;
}

export default function TenderRadar({ hits }: { hits: TenderHit[] }) {
  const [selected, setSelected] = useState<string | null>(null);

  const points: Point[] = hits
    .map((hit): Point | null => {
      const days = daysLeft(hit);
      if (days === null || hit.budget_status !== 'value' || hit.budget === null) return null;
      const budgetTwd = hit.budget / 100;
      return { hit, days, budgetTwd, xPct: daysToXPct(days), yPct: budgetToYPct(budgetTwd) };
    })
    .filter((p): p is Point => p !== null);

  const active = points.find((p) => p.hit.id === selected) ?? null;

  if (points.length === 0) {
    return (
      <section className="rounded-2xl nm-raised p-4">
        <h2 className="text-[15px] font-semibold" style={{ color: 'var(--nm-text-primary)' }}>開標視窗雷達</h2>
        <p className="mt-2 text-[12px] leading-[1.6]" style={{ color: 'var(--nm-text-muted)' }}>
          目前命中的案件都缺截止日或預算,算不出座標。
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl nm-raised p-4">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h2 className="text-[15px] font-semibold" style={{ color: 'var(--nm-text-primary)' }}>開標視窗雷達</h2>
        <span className="text-[11px] leading-none tracking-[.14em]" style={{ color: 'var(--nm-text-faint)' }}>
          x=距截止日 · y=預算(對數) · 圓點大小暫未接勝率
        </span>
      </div>

      <div className="flex" style={{ height: HEIGHT }}>
        <div className="relative shrink-0" style={{ width: LEFT_AXIS }}>
          {RADAR_Y_TICKS_TWD.map((twd) => {
            const topPct = (1 - budgetToYPct(twd)) * 100;
            return (
              <div
                key={twd}
                className="absolute right-1.5 -translate-y-1/2 text-[10px] tabular-nums leading-none"
                style={{ top: `${topPct}%`, color: 'var(--nm-text-faint)' }}
              >
                {twd / 1_000_000}M
              </div>
            );
          })}
        </div>

        <div className="relative flex-1 rounded-lg" style={{ overflow: 'hidden', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--nm-border-hair)' }}>
          {RADAR_Y_TICKS_TWD.map((twd) => (
            <div
              key={twd}
              className="absolute inset-x-0"
              style={{ top: `${(1 - budgetToYPct(twd)) * 100}%`, height: 1, background: 'var(--nm-border-hair)' }}
            />
          ))}

          {active && (
            <>
              <div
                className="absolute inset-y-0"
                style={{ left: `${active.xPct * 100}%`, width: 1, background: 'rgba(255,255,255,0.3)', borderLeft: '1px dashed rgba(255,255,255,0.3)' }}
              />
              <div
                className="absolute inset-x-0"
                style={{ top: `${(1 - active.yPct) * 100}%`, height: 1, borderTop: '1px dashed rgba(255,255,255,0.3)' }}
              />
            </>
          )}

          {points.map((p) => {
            const isSelected = p.hit.id === selected;
            return (
              <button
                key={p.hit.id}
                type="button"
                onClick={() => setSelected(isSelected ? null : p.hit.id)}
                className="absolute rounded-full nm-focus"
                style={{
                  left: `${p.xPct * 100}%`,
                  top: `${(1 - p.yPct) * 100}%`,
                  width: DOT_SIZE,
                  height: DOT_SIZE,
                  transform: 'translate(-50%, -50%)',
                  background: isSelected ? 'var(--nm-accent)' : 'rgba(255,255,255,0.7)',
                  border: '1.5px solid var(--nm-bg-deep)',
                  cursor: 'pointer',
                }}
                aria-label={p.hit.title}
              />
            );
          })}

          {active && (
            <div
              className="absolute rounded-lg nm-raised-lg p-2.5"
              style={{
                top: `${(1 - active.yPct) * 100}%`,
                ...(active.xPct > 0.6
                  ? { right: `${(1 - active.xPct) * 100}%`, marginRight: DOT_SIZE }
                  : { left: `${active.xPct * 100}%`, marginLeft: DOT_SIZE }),
                marginTop: -DOT_SIZE,
                width: 200,
                zIndex: 10,
              }}
            >
              <div className="text-[12px] font-medium truncate" style={{ color: 'var(--nm-text-primary)' }}>{active.hit.title}</div>
              <div className="mt-1 text-[11px] tabular-nums leading-[1.6]" style={{ color: 'var(--nm-text-secondary)' }}>
                還剩 {active.days} 天 · ${fmtBudget(active.budgetTwd)}
              </div>
            </div>
          )}
        </div>
      </div>

      <p className="mt-3 text-[12px] leading-[1.6]" style={{ color: 'var(--nm-text-muted)' }}>
        橫軸是距離截止日還有幾天(0=今天,30 天以後釘在右緣),縱軸是預算取對數。點一下圓點看細節。
      </p>
    </section>
  );
}
