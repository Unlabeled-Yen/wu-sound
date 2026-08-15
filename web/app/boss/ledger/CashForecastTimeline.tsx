'use client';

import { useState } from 'react';
import type { CashForecast } from '@/lib/ledger-cash-forecast';
import { updateCashSettings } from './actions';

// 視覺依 design_handoff_wu_sound/prototypes/18a.html 逐值照抄(14-cashflow-insight.md)。
// 核心規則:水位圖、進出柱、週標籤三者共用同一組欄位寬度與同一個 58px 左側
// gutter——折線的資料點必須跟下方柱子的中心對齊在同一條垂直線上,這是這次
// 重構要解決的問題(舊版兩張圖各自有 x 軸,讀者得自己把點跟卡連起來)。
// y 軸 domain 一律由資料算,不得硬編碼(§3-2)。

const fmt = (n: number) => n.toLocaleString('zh-TW');
const fmtSigned = (n: number) => `${n < 0 ? '−' : '＋'}$${fmt(Math.abs(n))}`;
const fmtK = (n: number) => {
  const abs = Math.abs(n);
  const s = abs >= 10000 ? `$${Math.round(abs / 1000)}K` : `$${fmt(abs)}`;
  return n < 0 ? `−${s}` : s;
};

const AXIS_GUTTER = 58;
const BALANCE_H = 200;
const FLOW_H = 96;
const BAR_W = 52;
const BAR_MAX_H = 44;

// 第 n 週中心(n=1..4)在 0-880 viewBox 裡的 x 座標:(n-0.5)/4 * 880。
const WEEK_CX = [110, 330, 550, 770];

// SVG 內的 polyline/polygon 用 viewBox 座標,preserveAspectRatio 會自動縮放。
// 但純 HTML 的 <span> 定位點不在 SVG 裡,left 用像素數字只在容器剛好 880px
// 寬時才準——容器實際寬度是 flex 算出來的,必須換算成百分比才會跟 SVG 對齊。
const pct = (x: number) => `${(x / 880) * 100}%`;

function weekLabel(w: { from: string; to: string }, idx: number): { title: string; range: string } {
  const short = (s: string) => s.slice(5).replace('-', '/');
  return { title: idx === 0 ? '本週' : `第 ${idx + 1} 週`, range: `${short(w.from)}–${short(w.to)}` };
}

function niceCeil100K(v: number): number {
  return Math.ceil(v / 100000) * 100000;
}
function niceFloor100K(v: number): number {
  return Math.floor(v / 100000) * 100000;
}

interface Props {
  forecast: CashForecast;
  startBalance: number;
  safetyLevel: number;
}

export function CashForecastTimeline({ forecast, startBalance, safetyLevel }: Props) {
  const [showDetail, setShowDetail] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const hasUnscheduled = forecast.unscheduledIncomeTwd > 0 || forecast.unscheduledExpenseTwd > 0;
  const hasBeyond = forecast.beyondIncomeTwd > 0 || forecast.beyondExpenseTwd > 0;
  const hasAnyData = forecast.weeks.some((w) => w.incomeTwd > 0 || w.expenseTwd > 0);
  const { delayedTrajectory, delayedReceivableLabel } = forecast;

  // §3-2 y 軸 domain:由資料算,不硬編碼。
  const onTimeAll = [startBalance, ...forecast.balanceTrajectory];
  const delayedAll = delayedTrajectory ? [startBalance, ...delayedTrajectory] : [];
  const allVals = [...onTimeAll, ...delayedAll];
  const minVal = Math.min(0, ...allVals);
  const maxVal = Math.max(...allVals);
  const domainMin = Math.min(0, niceFloor100K(minVal));
  const domainMax = Math.max(safetyLevel * 1.2, niceCeil100K(maxVal));
  const span = domainMax - domainMin || 1;
  const yOf = (v: number) => BALANCE_H - ((v - domainMin) / span) * BALANCE_H; // SVG y(從上算)
  const safetyY = yOf(safetyLevel);
  const safetyInRange = safetyLevel > domainMin && safetyLevel < domainMax;

  // 5 個 x 座標:起點(今天) + 4 週結束點。
  const xs = [0, ...WEEK_CX];
  const onTimePts = onTimeAll.map((v, i) => [xs[i], yOf(v)] as const);
  const delayedPts = delayedAll.map((v, i) => [xs[i], yOf(v)] as const);

  // 延遲路徑只從「兩情境分岔的那一週」畫,往前抓一個共同點連起來(§3-4)。
  let delayedStartIdx = -1;
  if (delayedTrajectory) {
    for (let i = 0; i < delayedAll.length; i++) {
      if (delayedAll[i] !== onTimeAll[i]) { delayedStartIdx = Math.max(0, i - 1); break; }
    }
  }
  const delayedDrawPts = delayedStartIdx >= 0 ? delayedPts.slice(delayedStartIdx) : [];

  // 沿路徑找出跌破安全水位的區段,組多邊形(路徑與零線之間,§3-3)。用線性
  // 內插找出真正的跨越點,不是直接拿週界點湊——資料很少剛好卡在安全水位上。
  const breachPolygons = safetyInRange ? buildBreachPolygons(onTimePts, safetyY) : [];
  const breachDots: { x: number; y: number; value: number }[] = [];
  if (safetyInRange) {
    onTimeAll.forEach((v, i) => {
      if (v < safetyLevel) breachDots.push({ x: xs[i], y: yOf(v), value: v });
    });
  }
  const worstBreach = breachDots.length > 0 ? breachDots.reduce((a, b) => (a.value < b.value ? a : b)) : null;

  const flowMax = Math.max(1, ...forecast.weeks.flatMap((w) => [w.incomeTwd, w.expenseTwd]));
  const flowScale = BAR_MAX_H / flowMax;

  return (
    <div className="nm-raised" style={{ borderRadius: 20, padding: '22px 26px 20px' }}>
      <div className="flex items-start justify-between gap-2 flex-wrap" style={{ marginBottom: 6 }}>
        <div style={{ font: '600 17px/1 "Noto Sans TC",sans-serif', color: 'var(--nm-text-primary)' }}>未來四週現金</div>
        <div className="flex items-center gap-2">
          {hasAnyData && (
            <div className="tabular-nums" style={{ font: '400 11.5px/1 var(--font-geist-mono),monospace', color: 'var(--nm-text-muted)' }}>
              起點 ${fmt(startBalance)}　·　安全水位 ${fmt(safetyLevel)}
              <button type="button" onClick={() => setShowSettings((v) => !v)} className="underline nm-focus" style={{ color: 'var(--nm-text-muted)' }}>
                {showSettings ? '收起' : '設定'}
              </button>
            </div>
          )}
        </div>
      </div>
      <div style={{ font: '400 12px/1.6 "Noto Sans TC",sans-serif', color: 'var(--nm-text-secondary)', marginBottom: 16 }}>
        依未收帳款的約定收款日與未付款到期日排入週次,全是預估,不與已收付合計。
      </div>

      {showSettings && (
        <form
          action={updateCashSettings}
          className="rounded-xl p-3 mb-4 flex flex-wrap items-end gap-3"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--nm-border-glass)' }}
        >
          <label className="flex flex-col gap-1">
            <span className="text-[11px]" style={{ color: 'var(--nm-text-muted)' }}>目前銀行/現金餘額 (TWD)</span>
            <input name="cash_start_balance" type="number" defaultValue={startBalance} min={0} className="nm-input text-[13px] tabular-nums" style={{ width: 160 }} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px]" style={{ color: 'var(--nm-text-muted)' }}>安全水位 (TWD)</span>
            <input name="cash_safety_level" type="number" defaultValue={safetyLevel} min={0} className="nm-input text-[13px] tabular-nums" style={{ width: 160 }} />
          </label>
          <button type="submit" className="nm-btn-solid text-[13px]" style={{ padding: '6px 16px' }}>儲存</button>
        </form>
      )}

      {!hasAnyData ? (
        <div className="mt-1 pt-3 text-[12px]" style={{ borderTop: '1px solid var(--nm-border-hair)', color: 'var(--nm-text-faint)' }}>
          未來四週沒有預計收付。{!safetyLevel && '請到設定頁填入安全水位。'}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-5" style={{ marginBottom: 14, font: '400 11.5px/1 "Noto Sans TC",sans-serif' }}>
            <span className="flex items-center gap-1.5" style={{ color: 'var(--nm-text-body)' }}>
              <span style={{ width: 16, height: 2, background: '#7ecf9d', display: 'block' }} />如期收款
            </span>
            {delayedTrajectory && (
              <span className="flex items-center gap-1.5" style={{ color: 'var(--nm-text-muted)' }}>
                <span style={{ width: 16, height: 0, borderTop: '2px dashed #d9b56b', display: 'block' }} />
                {delayedReceivableLabel}再延一個月
              </span>
            )}
          </div>

          {/* 水位圖 */}
          <div className="flex" style={{ gap: 0 }}>
            <div className="relative shrink-0" style={{ width: AXIS_GUTTER, height: BALANCE_H }}>
              <span className="absolute tabular-nums" style={{ right: 8, top: -6, font: '400 10px/1 var(--font-geist-mono),monospace', color: 'var(--nm-text-muted)' }}>{fmtK(domainMax)}</span>
              {safetyInRange && (
                <span className="absolute text-right tabular-nums" style={{ right: 8, top: safetyY - 6, font: '400 10px/1.4 var(--font-geist-mono),monospace', color: 'var(--nm-warning)' }}>
                  安全<br />{fmtK(safetyLevel)}
                </span>
              )}
              <span className="absolute tabular-nums" style={{ right: 8, top: yOf(0) - 5, font: '400 10px/1 var(--font-geist-mono),monospace', color: 'var(--nm-text-muted)' }}>$0</span>
              <span className="absolute tabular-nums" style={{ right: 8, bottom: -5, font: '400 10px/1 var(--font-geist-mono),monospace', color: 'var(--nm-danger-glass-text)' }}>{fmtK(domainMin)}</span>
            </div>
            <div className="relative flex-1 min-w-0" style={{ height: BALANCE_H, borderLeft: '1px solid rgba(255,255,255,.16)' }}>
              {safetyInRange && (
                <>
                  <div data-breach-zone className="absolute inset-x-0" style={{ top: safetyY, bottom: 0, background: 'rgba(224,122,122,.055)' }} />
                  <div className="absolute inset-x-0" style={{ top: safetyY, height: 0, borderTop: '1px dashed rgba(217,181,107,.55)' }} />
                </>
              )}
              <div className="absolute inset-x-0" style={{ top: yOf(0), height: 1, background: 'rgba(255,255,255,.16)' }} />

              <svg viewBox={`0 0 880 ${BALANCE_H}`} preserveAspectRatio="none" className="absolute inset-0 block" style={{ width: '100%', height: '100%' }}>
                {breachPolygons.map((pts, i) => (
                  <polygon key={i} points={pts.map((p) => p.join(',')).join(' ')} fill="rgba(224,122,122,.16)" />
                ))}
                {delayedDrawPts.length > 1 && (
                  <polyline
                    points={delayedDrawPts.map((p) => p.join(',')).join(' ')}
                    fill="none" stroke="#d9b56b" strokeWidth={2} strokeDasharray="7 5" vectorEffect="non-scaling-stroke"
                  />
                )}
                <polyline
                  points={onTimePts.map((p) => p.join(',')).join(' ')}
                  fill="none" stroke="#7ecf9d" strokeWidth={2.5} vectorEffect="non-scaling-stroke"
                />
              </svg>

              {worstBreach && (
                <>
                  <span
                    data-week-dot
                    className="absolute rounded-full block"
                    style={{ left: pct(worstBreach.x), top: worstBreach.y, marginTop: -5, marginLeft: -5, width: 10, height: 10, background: 'var(--nm-danger)', boxShadow: '0 0 12px rgba(224,122,122,.7)' }}
                  />
                  <span
                    className="absolute whitespace-nowrap rounded"
                    style={{
                      left: pct(worstBreach.x), top: worstBreach.y, marginTop: -34, marginLeft: 14, padding: '3px 7px', borderRadius: 3,
                      background: 'var(--nm-bg-deep)', border: '1px solid rgba(224,122,122,.34)',
                      font: '500 11px/1.4 var(--font-geist-mono),monospace', color: 'var(--nm-danger-glass-text)',
                    }}
                  >
                    {fmtSigned(worstBreach.value)}<br /><span style={{ font: '400 10px/1.4 "Noto Sans TC",sans-serif' }}>跌破水位</span>
                  </span>
                </>
              )}

              {onTimePts.slice(1).map(([x, y], i) => (
                (!worstBreach || worstBreach.x !== x || worstBreach.y !== y) && (
                  <span
                    key={`on-${i}`}
                    data-week-dot
                    className="absolute rounded-full block"
                    style={{ left: pct(x), top: y, marginTop: -4, marginLeft: -4, width: 8, height: 8, background: '#7ecf9d' }}
                  />
                )
              ))}
              {delayedDrawPts.slice(1).map(([x, y], i) => (
                <span
                  key={`del-${i}`}
                  className="absolute rounded-full block"
                  style={{ left: pct(x), top: y, marginTop: -4, marginLeft: -4, width: 8, height: 8, border: '1.5px solid #d9b56b', background: 'var(--nm-bg-deep)' }}
                />
              ))}
            </div>
          </div>

          {/* 進出柱(共用同一組欄位寬度) */}
          <div className="flex" style={{ gap: 0 }}>
            <div className="relative shrink-0" style={{ width: AXIS_GUTTER, height: FLOW_H }}>
              <span className="absolute" style={{ right: 8, top: 12, font: '400 9.5px/1 "Noto Sans TC",sans-serif', color: 'var(--nm-text-muted)' }}>進帳</span>
              <span className="absolute" style={{ right: 8, top: 66, font: '400 9.5px/1 "Noto Sans TC",sans-serif', color: 'var(--nm-text-muted)' }}>付出</span>
            </div>
            <div className="relative flex-1 min-w-0" style={{ height: FLOW_H, borderLeft: '1px solid rgba(255,255,255,.16)' }}>
              <div className="absolute inset-x-0" style={{ top: FLOW_H / 2, height: 1, background: 'rgba(255,255,255,.16)' }} />
              <div className="absolute inset-0 flex">
                {forecast.weeks.map((w, idx) => (
                  <div key={idx} data-week-col className="flex-1 relative" style={idx < 3 ? { borderRight: '1px solid rgba(255,255,255,.05)' } : undefined}>
                    {w.incomeTwd > 0 && (
                      <span
                        data-flow-bar data-dir="in" data-value={w.incomeTwd}
                        className="absolute block"
                        style={{ left: '50%', bottom: FLOW_H / 2, marginLeft: -BAR_W / 2, width: BAR_W, height: w.incomeTwd * flowScale, background: 'rgba(126,207,157,.5)', borderRadius: '2px 2px 0 0' }}
                      />
                    )}
                    {w.expenseTwd > 0 && (
                      <span
                        data-flow-bar data-dir="out" data-value={w.expenseTwd}
                        className="absolute block"
                        style={{ left: '50%', top: FLOW_H / 2 + 1, marginLeft: -BAR_W / 2, width: BAR_W, height: w.expenseTwd * flowScale, border: '1.5px solid var(--nm-danger)', background: 'rgba(224,122,122,.14)', borderRadius: '0 0 2px 2px' }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 週標籤欄 */}
          <div className="flex" style={{ gap: 0, marginTop: 2 }}>
            <div className="shrink-0" style={{ width: AXIS_GUTTER }} />
            <div className="flex-1 min-w-0 flex" style={{ borderTop: '1px solid rgba(255,255,255,.1)', paddingTop: 11 }}>
              {forecast.weeks.map((w, idx) => {
                const { title, range } = weekLabel(w, idx);
                const incomeItems = w.items.filter((it) => it.direction === 'receivable');
                const expenseItems = w.items.filter((it) => it.direction === 'payable');
                const topIncome = incomeItems.sort((a, b) => b.amount - a.amount)[0];
                const topExpense = expenseItems.sort((a, b) => b.amount - a.amount)[0];
                return (
                  <div key={idx} className="flex-1 min-w-0" style={{ paddingRight: idx < 3 ? 12 : 0 }}>
                    <div className="truncate" style={{ font: '500 12.5px/1 "Noto Sans TC",sans-serif', color: idx === 0 ? 'var(--nm-text-primary)' : 'var(--nm-text-body)', marginBottom: 5 }}>{title}</div>
                    <div className="tabular-nums truncate" style={{ font: '400 10.5px/1.5 var(--font-geist-mono),monospace', color: 'var(--nm-text-muted)', marginBottom: 8 }}>{range}</div>
                    <div className="truncate" style={{ font: '400 11px/1.55 "Noto Sans TC",sans-serif', color: 'var(--nm-text-secondary)' }}>
                      {topIncome ? (
                        <>
                          <span style={{ color: 'var(--nm-success-glass-text)' }}>＋${fmt(topIncome.amount)}</span> {topIncome.label}{incomeItems.length > 1 ? ` 等 ${incomeItems.length} 筆` : ''}
                          <br />
                        </>
                      ) : null}
                      {topExpense ? (
                        <span style={{ color: 'var(--nm-danger-glass-text)' }}>−${fmt(topExpense.amount)}</span>
                      ) : topIncome ? null : (
                        <span style={{ color: 'var(--nm-text-faint)' }}>無付出</span>
                      )}
                      {topExpense && <> {topExpense.label}{expenseItems.length > 1 ? ` 等 ${expenseItems.length} 筆` : ''}</>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* 展開全部明細 */}
      {forecast.weeks.some((w) => w.items.length > 0) && (
        <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,.06)' }}>
          <button
            type="button"
            onClick={() => setShowDetail(!showDetail)}
            className="underline nm-focus"
            style={{ font: '400 11.5px/1 "Noto Sans TC",sans-serif', color: 'var(--nm-text-secondary)' }}
          >
            {showDetail ? '收起明細 ▴' : '看每一筆預計收付'}
          </button>
          {hasBeyond && (
            <span className="float-right tabular-nums" style={{ font: '400 11.5px/1 "Noto Sans TC",sans-serif', color: 'var(--nm-text-faint)' }}>
              4 週以後到期　應收 <span style={{ fontFamily: 'var(--font-geist-mono)' }}>${fmt(forecast.beyondIncomeTwd)}</span>（{forecast.beyondIncomeCount} 筆）　·　應付 <span style={{ fontFamily: 'var(--font-geist-mono)' }}>${fmt(forecast.beyondExpenseTwd)}</span>
            </span>
          )}
        </div>
      )}

      {showDetail && (
        <div className="mt-2 grid grid-cols-4 gap-1 text-[11px]" style={{ color: 'var(--nm-text-secondary)' }}>
          {forecast.weeks.map((w, idx) => (
            <div key={idx} className="space-y-0.5">
              {w.items.length === 0 ? (
                <div style={{ color: 'var(--nm-text-faint)' }}>—</div>
              ) : (
                w.items.map((it, j) => (
                  <div key={j} className="tabular-nums truncate">
                    <span style={{ color: it.direction === 'receivable' ? 'var(--nm-success-glass-text)' : 'var(--nm-danger-glass-text)' }}>
                      {it.direction === 'receivable' ? '＋' : '－'}${fmt(it.amount)}
                    </span>
                    {' '}{it.label}{it.overdue ? '（逾期）' : ''}
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      )}

      {hasUnscheduled && (
        <div className="pt-3 mt-3 text-[12px] tabular-nums" style={{ borderTop: '1px solid var(--nm-border-hair)', color: 'var(--nm-text-muted)' }}>
          未排定日期:應收 ${fmt(forecast.unscheduledIncomeTwd)}({forecast.unscheduledIncomeCount} 筆) · 應付 ${fmt(forecast.unscheduledExpenseTwd)}({forecast.unscheduledExpenseCount} 筆) —— 這些錢不知道何時到,不畫進上面的週次
        </div>
      )}
    </div>
  );
}

/**
 * 找出路徑跌破安全水位的區段,各自組一個「路徑—安全水位線」之間的多邊形。
 * 用線性內插算出真正的跨越 x 座標(資料很少剛好卡在安全水位上),不是直接
 * 拿週界點湊出多邊形——那樣跨越點會偏。
 */
function buildBreachPolygons(pts: readonly (readonly [number, number])[], safetyY: number): [number, number][][] {
  const polygons: [number, number][][] = [];
  let current: [number, number][] | null = null;

  const crossPoint = (a: readonly [number, number], b: readonly [number, number]): [number, number] => {
    const t = (safetyY - a[1]) / (b[1] - a[1]);
    return [a[0] + (b[0] - a[0]) * t, safetyY];
  };

  for (let i = 0; i < pts.length; i++) {
    const below = pts[i][1] > safetyY; // SVG y 越大代表數值越低(越接近底部)
    if (below) {
      if (!current) {
        current = [];
        if (i > 0 && pts[i - 1][1] <= safetyY) {
          current.push(crossPoint(pts[i - 1], pts[i]));
        } else {
          current.push([pts[i][0], safetyY]);
        }
      }
      current.push([pts[i][0], pts[i][1]]);
    } else if (current) {
      const cross = crossPoint(pts[i - 1], pts[i]);
      current.push(cross);
      current.push([cross[0], safetyY]);
      polygons.push(current);
      current = null;
    }
  }
  if (current) {
    current.push([current[current.length - 1][0], safetyY]);
    polygons.push(current);
  }
  return polygons;
}
