'use client';

import { useState } from 'react';
import type { CashForecast } from '@/lib/ledger-cash-forecast';
import { updateCashSettings } from './actions';

const fmt = (n: number) => n.toLocaleString('zh-TW');
const fmtK = (n: number) => {
  if (n >= 10000) return `$${Math.round(n / 1000)}K`;
  return `$${fmt(n)}`;
};

function weekLabel(w: { from: string; to: string }, idx: number): { title: string; range: string } {
  const short = (s: string) => s.slice(5).replace('-', '/');
  return { title: `第 ${idx + 1} 週`, range: `${short(w.from)}–${short(w.to)}` };
}

interface Props {
  forecast: CashForecast;
  startBalance: number;
  safetyLevel: number;
}

const CHART_H = 160;
const DOT_R = 6;

function balanceChart(
  trajectory: number[],
  startBalance: number,
  safetyLevel: number,
) {
  const allValues = [startBalance, ...trajectory, safetyLevel];
  const maxVal = Math.max(...allValues);
  const minVal = Math.min(0, ...allValues);
  const range = maxVal - minVal || 1;
  const pad = range * 0.12;
  const yMax = maxVal + pad;
  const yMin = minVal - pad;
  const yRange = yMax - yMin;

  const toY = (val: number) => CHART_H - ((val - yMin) / yRange) * CHART_H;

  const ticks: number[] = [];
  const step = Math.pow(10, Math.floor(Math.log10(range)));
  const niceStep = step >= range ? step / 2 : step;
  for (let v = 0; v <= yMax; v += niceStep) ticks.push(v);
  for (let v = -niceStep; v >= yMin; v -= niceStep) ticks.push(v);
  if (safetyLevel > 0 && !ticks.includes(safetyLevel)) ticks.push(safetyLevel);

  return { toY, ticks, yMax, yMin };
}

export function CashForecastTimeline({ forecast, startBalance, safetyLevel }: Props) {
  const [showDetail, setShowDetail] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const hasUnscheduled = forecast.unscheduledIncomeTwd > 0 || forecast.unscheduledExpenseTwd > 0;
  const hasBeyond = forecast.beyondIncomeTwd > 0 || forecast.beyondExpenseTwd > 0;

  const hasAnyData = forecast.weeks.some((w) => w.incomeTwd > 0 || w.expenseTwd > 0);
  const { toY, ticks } = hasAnyData
    ? balanceChart(forecast.balanceTrajectory, startBalance, safetyLevel)
    : { toY: () => 0, ticks: [] };

  const nearSafety = hasAnyData && forecast.balanceTrajectory.some((v) => v > 0 && v <= safetyLevel * 1.05);
  const belowSafety = hasAnyData && forecast.balanceTrajectory.some((v) => v <= safetyLevel);

  return (
    <div className="rounded-2xl nm-raised p-5">
      <div className="flex items-baseline justify-between gap-2 flex-wrap mb-2.5">
        <div className="text-[15px] font-semibold" style={{ color: 'var(--nm-text-primary)' }}>未來四週現金</div>
        <div className="flex items-center gap-3">
          {hasAnyData && (
            <div className="text-[12px] tabular-nums" style={{ color: 'var(--nm-text-muted)' }}>
              起點 ${fmt(startBalance)} · 安全水位 ${fmt(safetyLevel)}
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            className="text-[11px] nm-focus"
            style={{ color: 'var(--nm-text-faint)' }}
          >
            {showSettings ? '收起' : '設定'}
          </button>
        </div>
      </div>
      <div className="text-[12.5px] leading-[1.7] mb-4" style={{ color: 'var(--nm-text-secondary)' }}>
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

      {/* ---- 餘額水位瀑布圖 ---- */}
      {hasAnyData && (
        <>
          <div className="flex items-center gap-5 mb-3 text-[11px]" style={{ color: 'var(--nm-text-secondary)' }}>
            <span className="flex items-center gap-1.5">
              <span style={{ width: 10, height: 10, background: 'var(--nm-success)', borderRadius: 2, display: 'inline-block' }} />
              如期收款
            </span>
          </div>

          <div className="flex mb-1">
            {/* Y 軸標籤 */}
            <div className="relative shrink-0" style={{ width: 56, height: CHART_H }}>
              {ticks.map((v) => (
                <div
                  key={v}
                  className="absolute right-2 -translate-y-1/2 text-[10px] tabular-nums leading-none"
                  style={{ top: toY(v), color: v === safetyLevel ? 'var(--nm-warning-glass-text)' : 'var(--nm-text-faint)' }}
                >
                  {fmtK(v)}
                </div>
              ))}
              {safetyLevel > 0 && (
                <div
                  className="absolute right-2 text-[10px] leading-none font-medium"
                  style={{ top: toY(safetyLevel) + 10, color: 'var(--nm-warning-glass-text)' }}
                >
                  安全水位
                </div>
              )}
            </div>

            {/* 圖表區 */}
            <div
              className="relative flex-1 min-w-0 rounded-lg"
              style={{ height: CHART_H, overflow: 'visible', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--nm-border-hair)' }}
            >
              {/* 刻度線 */}
              {ticks.filter((v) => v !== safetyLevel).map((v) => (
                <div
                  key={v}
                  className="absolute inset-x-0"
                  style={{ top: toY(v), height: 1, background: 'var(--nm-border-hair)' }}
                />
              ))}

              {/* 安全水位虛線 */}
              {safetyLevel > 0 && (
                <div
                  className="absolute inset-x-0"
                  style={{
                    top: toY(safetyLevel),
                    height: 0,
                    borderTop: '2px dashed var(--nm-warning)',
                    opacity: 0.5,
                  }}
                />
              )}

              {/* 連線:用百分比座標的 SVG,避免 preserveAspectRatio=none 的 strokeWidth 變形 */}
              <svg
                className="absolute inset-0"
                style={{ width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}
              >
                {/* 起點到第一週 */}
                <line
                  x1="0%" y1={toY(startBalance)}
                  x2="12.5%" y2={toY(forecast.balanceTrajectory[0])}
                  stroke="rgba(126,207,157,0.4)" strokeWidth="1.5"
                />
                {/* 週間連線 */}
                {forecast.balanceTrajectory.slice(0, -1).map((val, i) => (
                  <line
                    key={i}
                    x1={`${12.5 + i * 25}%`} y1={toY(val)}
                    x2={`${12.5 + (i + 1) * 25}%`} y2={toY(forecast.balanceTrajectory[i + 1])}
                    stroke="rgba(126,207,157,0.4)" strokeWidth="1.5"
                  />
                ))}
              </svg>

              {/* 餘額點 */}
              <div className="absolute inset-0 flex">
                {forecast.balanceTrajectory.map((val, i) => {
                  const isBelowSafe = safetyLevel > 0 && val <= safetyLevel;
                  const dotColor = isBelowSafe ? 'var(--nm-warning)' : 'var(--nm-success)';
                  const dotBg = isBelowSafe ? 'rgba(217,181,107,0.3)' : 'rgba(126,207,157,0.3)';
                  return (
                    <div key={i} className="flex-1 relative">
                      <div
                        className="absolute -translate-x-1/2 -translate-y-1/2"
                        style={{
                          left: '50%',
                          top: toY(val),
                          width: DOT_R * 2,
                          height: DOT_R * 2,
                          borderRadius: 3,
                          background: dotBg,
                          border: `2px solid ${dotColor}`,
                        }}
                      />
                      {/* 數值標籤 */}
                      <div
                        className="absolute -translate-x-1/2 text-[11px] tabular-nums font-semibold whitespace-nowrap"
                        style={{
                          left: '50%',
                          top: toY(val) + (val >= startBalance ? -20 : 14),
                          color: isBelowSafe ? 'var(--nm-warning-glass-text)' : 'var(--nm-success-glass-text)',
                        }}
                      >
                        {fmtK(val)}
                        {isBelowSafe && nearSafety && i === forecast.balanceTrajectory.findIndex((v) => v <= safetyLevel) && (
                          <div className="text-[10px] font-normal mt-0.5" style={{ color: 'var(--nm-warning-glass-text)' }}>已貼水位</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 軌跡文字 */}
          <div className="flex mb-4">
            <div style={{ width: 56, flexShrink: 0 }} />
            <div className="flex-1 min-w-0 text-[11px] tabular-nums" style={{ color: 'var(--nm-text-muted)' }}>
              如期收款 {forecast.balanceTrajectory.map((v) => fmtK(v)).join(' › ')}
            </div>
          </div>
        </>
      )}

      {/* ---- 當週收付明細 ---- */}
      <div className="flex mb-3">
        <div style={{ width: 56, flexShrink: 0, position: 'relative' }}>
          <div style={{ fontSize: 10.5, color: 'var(--nm-text-faint)', textAlign: 'right', paddingRight: 8 }}>當週<br />進帳</div>
          <div style={{ fontSize: 10.5, color: 'var(--nm-text-faint)', textAlign: 'right', paddingRight: 8, marginTop: 8 }}>當週<br />付出</div>
        </div>
        <div className="flex-1 min-w-0 flex gap-1">
          {forecast.weeks.map((w, idx) => {
            const solid = idx === 0;
            const incomeItems = w.items.filter((it) => it.direction === 'receivable');
            const expenseItems = w.items.filter((it) => it.direction === 'payable');
            const topIncome = incomeItems.sort((a, b) => b.amount - a.amount)[0];
            const topExpense = expenseItems.sort((a, b) => b.amount - a.amount)[0];

            return (
              <div key={idx} className="flex-1 min-w-0 flex flex-col gap-1">
                {/* 進帳 */}
                {w.incomeTwd > 0 ? (
                  <div
                    className="rounded p-1.5 min-h-[40px] min-w-0 flex flex-col justify-center"
                    style={{
                      background: solid ? 'rgba(126,207,157,.18)' : 'rgba(126,207,157,.08)',
                      border: solid ? '1px solid rgba(126,207,157,.36)' : '1px solid rgba(126,207,157,.2)',
                    }}
                  >
                    <div className="tabular-nums text-[12px] font-semibold truncate" style={{ color: 'var(--nm-success-glass-text)' }}>
                      ＋${fmt(w.incomeTwd)}
                    </div>
                    {topIncome && (
                      <div className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--nm-text-muted)' }}>
                        {topIncome.label}{topIncome.overdue ? '（已逾期）' : ''}
                        {incomeItems.length > 1 ? ` +${incomeItems.length - 1}筆` : ''}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="min-h-[40px]" />
                )}

                {/* 付出 */}
                {w.expenseTwd > 0 ? (
                  <div
                    className="rounded p-1.5 min-h-[40px] min-w-0 flex flex-col justify-center"
                    style={{
                      background: solid ? 'rgba(224,122,122,.16)' : 'rgba(224,122,122,.08)',
                      border: solid ? '1px solid rgba(224,122,122,.34)' : '1px solid rgba(224,122,122,.18)',
                    }}
                  >
                    <div className="tabular-nums text-[12px] font-semibold truncate" style={{ color: 'var(--nm-danger-glass-text)' }}>
                      －${fmt(w.expenseTwd)}
                    </div>
                    {topExpense && (
                      <div className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--nm-text-muted)' }}>
                        {topExpense.label}{topExpense.overdue ? '（已逾期）' : ''}
                        {expenseItems.length > 1 ? ` +${expenseItems.length - 1}筆` : ''}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="min-h-[40px]" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 週標籤列 */}
      <div className="flex mb-3">
        <div style={{ width: 56, flexShrink: 0 }} />
        <div className="flex-1 min-w-0 flex gap-1">
          {forecast.weeks.map((w, idx) => {
            const { title, range } = weekLabel(w, idx);
            return (
              <div key={idx} className="flex-1 min-w-0 px-1">
                <div className="text-[12px] font-medium truncate" style={{ color: 'var(--nm-text-body)' }}>{idx === 0 ? '本週' : title}</div>
                <div className="text-[10.5px] truncate" style={{ color: 'var(--nm-text-faint)' }}>{range}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 展開全部明細 */}
      {forecast.weeks.some((w) => w.items.length > 0) && (
        <button
          type="button"
          onClick={() => setShowDetail(!showDetail)}
          className="text-[12px] nm-focus"
          style={{ color: 'var(--nm-text-muted)' }}
        >
          {showDetail ? '收起明細 ▴' : '看每一筆預計收付 ▾'}
        </button>
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

      {(hasUnscheduled || hasBeyond) && (
        <div className="pt-3 mt-3 text-[12px] flex flex-col gap-1 tabular-nums" style={{ borderTop: '1px solid var(--nm-border-hair)', color: 'var(--nm-text-muted)' }}>
          {hasUnscheduled && (
            <div>
              未排定日期:應收 ${fmt(forecast.unscheduledIncomeTwd)}({forecast.unscheduledIncomeCount} 筆) · 應付 ${fmt(forecast.unscheduledExpenseTwd)}({forecast.unscheduledExpenseCount} 筆) —— 這些錢不知道何時到,不畫進上面的週次
            </div>
          )}
          {hasBeyond && (
            <div>
              4 週以後到期:應收 ${fmt(forecast.beyondIncomeTwd)}({forecast.beyondIncomeCount} 筆) · 應付 ${fmt(forecast.beyondExpenseTwd)}({forecast.beyondExpenseCount} 筆)
            </div>
          )}
        </div>
      )}

      {!hasAnyData && (
        <div className="mt-3 pt-3 text-[11px]" style={{ borderTop: '1px solid var(--nm-border-hair)', color: 'var(--nm-text-faint)' }}>
          餘額水位圖需要設定「現金起點」——請到設定頁填入目前的銀行/現金餘額與安全水位門檻。
        </div>
      )}
    </div>
  );
}
