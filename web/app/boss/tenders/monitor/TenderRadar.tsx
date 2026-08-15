'use client';

import { useState } from 'react';
import {
  daysLeft,
  daysToXPct,
  budgetToYPct,
  isRetender,
  RADAR_Y_TICKS_TWD,
  type TenderHit,
} from './shared';

// 開標視窗雷達(07-視覺校正指南 §3.4-4)。
//
// 這裡刻意「不」照設計圖裡的黃圈=建議投、紅圈=越線警報、圓大小=Wu 勝率
// 三種語意畫——那三份資料 tender-radar 目前都沒有(需要 Wu 自己過去的投標
// 決策紀錄、對手投標金額歷史 + 越線門檻設定)。畫上去會是假數據。
//
// 改用現有欄位當染色/尺寸來源,但語意跟設計圖一致「行動優先級」:
//   黃圈 = 七日內截止(急,要決定投不投)     ← daysLeft <= 7
//   紅圈 = 流標重招(重要事件、機會)         ← isRetender()
//   灰圈 = 一般觀察                           ← 其餘
//   圓大小 = 預算大小 log 標度               ← 沒有勝率,先用金額當「權重」
// 這樣至少每個點都攜帶行動意義,不是統一白圓。字面規則跟設計圖不同,tooltip
// 會把實際判斷標明,免得使用者以為系統在算勝率。

const HEIGHT = 236;
const LEFT_AXIS = 44;
const DOT_MIN = 10;
const DOT_MAX = 26;

interface Point {
  hit: TenderHit;
  days: number;
  budgetTwd: number;
  xPct: number;
  yPct: number;
  role: 'urgent' | 'retender' | 'watch';
  size: number;
}

function fmtBudget(twd: number): string {
  if (twd >= 10_000) return `${(twd / 10_000).toLocaleString('zh-TW', { maximumFractionDigits: 1 })} 萬`;
  return `${twd.toLocaleString('zh-TW')}`;
}

function classify(hit: TenderHit, days: number): Point['role'] {
  if (isRetender(hit)) return 'retender';
  if (days <= 7) return 'urgent';
  return 'watch';
}

function roleStyle(role: Point['role'], selected: boolean): { background: string; border: string; label: string } {
  if (selected) {
    return {
      background: 'var(--nm-accent)',
      border: '1.5px solid var(--nm-bg-deep)',
      label: '選中',
    };
  }
  switch (role) {
    case 'retender':
      return {
        background: 'rgba(224,122,122,0.28)',
        border: '1.5px solid var(--nm-danger)',
        label: '流標重招',
      };
    case 'urgent':
      return {
        background: 'rgba(217,181,107,0.28)',
        border: '1.5px solid var(--nm-warning)',
        label: '七日內截止',
      };
    case 'watch':
      return {
        background: 'rgba(255,255,255,0.10)',
        border: '1.5px solid rgba(255,255,255,0.35)',
        label: '觀察',
      };
  }
}

// 預算 -> 圓點直徑:log 尺度,跟 y 軸同一套換算,10 萬以下 min、12M 以上 max
function sizeForBudget(twd: number): number {
  const yPct = budgetToYPct(twd); // 0~1
  return DOT_MIN + yPct * (DOT_MAX - DOT_MIN);
}

export default function TenderRadar({ hits }: { hits: TenderHit[] }) {
  const [selected, setSelected] = useState<string | null>(null);

  const points: Point[] = hits
    .map((hit): Point | null => {
      const days = daysLeft(hit);
      if (days === null || hit.budget_status !== 'value' || hit.budget === null) return null;
      const budgetTwd = hit.budget / 100;
      return {
        hit,
        days,
        budgetTwd,
        xPct: daysToXPct(days),
        yPct: budgetToYPct(budgetTwd),
        role: classify(hit, days),
        size: sizeForBudget(budgetTwd),
      };
    })
    .filter((p): p is Point => p !== null);

  // 大圓在下、小圓在上,避免大案子把小案子完全蓋住
  points.sort((a, b) => b.size - a.size);

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
          x=距截止日 · y=預算對數 · 圓大小=預算
        </span>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-3 text-[11px] leading-none" style={{ color: 'var(--nm-text-muted)' }}>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: 'rgba(224,122,122,0.28)', border: '1.5px solid var(--nm-danger)' }} />
          流標重招
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: 'rgba(217,181,107,0.28)', border: '1.5px solid var(--nm-warning)' }} />
          七日內截止
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: 'rgba(255,255,255,0.10)', border: '1.5px solid rgba(255,255,255,0.35)' }} />
          觀察
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
            const style = roleStyle(p.role, isSelected);
            return (
              <button
                key={p.hit.id}
                type="button"
                onClick={() => setSelected(isSelected ? null : p.hit.id)}
                className="absolute rounded-full nm-focus"
                style={{
                  left: `${p.xPct * 100}%`,
                  top: `${(1 - p.yPct) * 100}%`,
                  width: p.size,
                  height: p.size,
                  transform: 'translate(-50%, -50%)',
                  background: style.background,
                  border: style.border,
                  cursor: 'pointer',
                  zIndex: isSelected ? 20 : Math.round(30 - p.size), // 大圓在下小圓在上
                }}
                aria-label={`${style.label}:${p.hit.title}`}
              />
            );
          })}

          {active && (
            <div
              className="absolute rounded-lg nm-raised-lg p-2.5"
              style={{
                top: `${(1 - active.yPct) * 100}%`,
                ...(active.xPct > 0.6
                  ? { right: `${(1 - active.xPct) * 100}%`, marginRight: active.size / 2 + 6 }
                  : { left: `${active.xPct * 100}%`, marginLeft: active.size / 2 + 6 }),
                marginTop: -(active.size / 2 + 4),
                width: 220,
                zIndex: 30,
              }}
            >
              <div className="text-[12px] font-medium truncate" style={{ color: 'var(--nm-text-primary)' }}>{active.hit.title}</div>
              <div className="mt-1 text-[11px] tabular-nums leading-[1.6]" style={{ color: 'var(--nm-text-secondary)' }}>
                {roleStyle(active.role, false).label} · 還剩 {active.days} 天 · ${fmtBudget(active.budgetTwd)}
              </div>
            </div>
          )}
        </div>
      </div>

      <p className="mt-3 text-[12px] leading-[1.6]" style={{ color: 'var(--nm-text-muted)' }}>
        橫軸=距離截止日(0=今天,30 天以後釘在右緣);縱軸=預算對數;圓大小=預算大小。
        顏色代表行動優先:紅=流標重招,黃=七日內截止,灰=觀察。
        (「我方勝率/對手越線」需要 Wu 自己過去的投標紀錄跟對手殺價門檻,尚未接上。)
      </p>
    </section>
  );
}
