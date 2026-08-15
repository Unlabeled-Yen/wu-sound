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

// 視覺依 design_handoff_wu_sound/prototypes/7a.html「未來四週現金」逐值照抄:
// Y 軸欄寬 88px、圖表高 140px、圓角方塊點 14×10、安全水位 1px 虛線、每週一根
// 灰色垂直連桿把「如期收款」實心點跟「{最大應收}再延一個月」空心點連起來——
// 不是畫一條跨週的趨勢線,原型裡的線是同一週內兩種情境的差距,不是週與週之間
// 的走勢。唯一的刻意偏離:原型的 Y 軸是寫死 $0–$350K(配那份 demo 資料),
// 這裡改成依實際資料動態抓一個「好看的整數」上限,否則真實金額一旦超過
// $350K(已經在測試資料裡發生過)整張圖会截斷。
const CHART_H = 140;
const AXIS_W = 88;
const DOT_W = 14;
const DOT_H = 10;

function niceMax(value: number): number {
  if (value <= 0) return 100000;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const steps = [1, 1.5, 2, 2.5, 5, 10];
  for (const s of steps) {
    if (value <= s * magnitude) return s * magnitude;
  }
  return 10 * magnitude;
}

export function CashForecastTimeline({ forecast, startBalance, safetyLevel }: Props) {
  const [showDetail, setShowDetail] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const hasUnscheduled = forecast.unscheduledIncomeTwd > 0 || forecast.unscheduledExpenseTwd > 0;
  const hasBeyond = forecast.beyondIncomeTwd > 0 || forecast.beyondExpenseTwd > 0;

  const hasAnyData = forecast.weeks.some((w) => w.incomeTwd > 0 || w.expenseTwd > 0);
  const { delayedTrajectory, delayedReceivableLabel } = forecast;

  const yMax = hasAnyData
    ? niceMax(Math.max(startBalance, safetyLevel, ...forecast.balanceTrajectory, ...(delayedTrajectory ?? [])))
    : 0;
  // top-based:0 在圖表頂端(=yMax),CHART_H 在底部(=0)
  const yFromTop = (v: number) => CHART_H - (Math.max(0, v) / yMax) * CHART_H;

  // 延遲情境第一次貼近/跌破安全水位的那一週——只在那一週標紅、標「已貼水位」,
  // 其餘週維持黃色空心(有風險但還沒真的貼線),避免整條線一路標紅、警訊被稀釋。
  const dangerWeekIndex = delayedTrajectory
    ? delayedTrajectory.findIndex((v) => safetyLevel > 0 && v <= safetyLevel * 1.05)
    : -1;

  return (
    <div className="rounded-2xl nm-raised p-5">
      <div className="flex items-baseline justify-between gap-2 flex-wrap mb-2.5">
        <div className="text-[15px] font-semibold" style={{ color: 'var(--nm-text-primary)' }}>未來四週現金</div>
        <div className="flex items-center gap-3">
          {hasAnyData && (
            <div className="text-[12px] leading-none tabular-nums" style={{ color: 'var(--nm-text-faint)' }}>
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
      <div className="text-[12.5px] leading-[1.7] mb-5" style={{ color: 'var(--nm-text-secondary)' }}>
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
          <div className="flex items-center gap-[22px] mb-4 text-[11.5px] leading-none" style={{ color: 'var(--nm-text-secondary)' }}>
            <span className="flex items-center gap-[7px]">
              <span style={{ width: 11, height: 11, background: '#a9e3c1', borderRadius: 2, display: 'inline-block' }} />
              如期收款
            </span>
            {delayedTrajectory && (
              <span className="flex items-center gap-[7px]">
                <span style={{ width: 11, height: 11, border: '1.5px solid #d9b56b', borderRadius: 2, display: 'inline-block' }} />
                {delayedReceivableLabel}再延一個月
              </span>
            )}
          </div>

          <div className="flex mb-6">
            {/* Y 軸標籤:固定三個——上限、安全水位、$0,不畫一串刻度 */}
            <div className="relative shrink-0" style={{ width: AXIS_W, height: CHART_H }}>
              <div className="absolute right-3 text-[10.5px] leading-none" style={{ top: -5, color: 'var(--nm-text-faint)' }}>{fmtK(yMax)}</div>
              {safetyLevel > 0 && safetyLevel <= yMax && (
                <div
                  className="absolute right-3 text-right text-[10.5px] leading-[1.5]"
                  style={{ top: yFromTop(safetyLevel) - 14, color: 'var(--nm-warning-glass-text)' }}
                >
                  安全水位<br /><span className="font-semibold">{fmtK(safetyLevel)}</span>
                </div>
              )}
              <div className="absolute right-3 text-[10.5px] leading-none" style={{ bottom: -5, color: 'var(--nm-text-faint)' }}>$0</div>
            </div>

            {/* 圖表區 */}
            <div
              className="relative flex-1 min-w-0"
              style={{ height: CHART_H, borderLeft: '1px solid var(--nm-border-glass)', borderBottom: '1px solid var(--nm-border-glass)' }}
            >
              {/* 安全水位虛線 */}
              {safetyLevel > 0 && safetyLevel <= yMax && (
                <div
                  className="absolute inset-x-0"
                  style={{ top: yFromTop(safetyLevel), borderTop: '1px dashed rgba(217,181,107,.6)' }}
                />
              )}

              <div className="absolute inset-0 flex">
                {forecast.balanceTrajectory.map((onTimeVal, i) => {
                  const delayedVal = delayedTrajectory?.[i];
                  const onTimeCenter = yFromTop(onTimeVal);
                  const delayedCenter = delayedVal !== undefined ? yFromTop(delayedVal) : null;
                  const isDanger = i === dangerWeekIndex;

                  return (
                    <div key={i} className="flex-1 relative">
                      {/* 連桿:同一週兩種情境的差距,不是跨週趨勢線 */}
                      {delayedCenter !== null && (
                        <div
                          className="absolute"
                          style={{
                            left: '50%', width: 1, transform: 'translateX(-50%)',
                            top: Math.min(onTimeCenter, delayedCenter),
                            height: Math.abs(onTimeCenter - delayedCenter),
                            background: 'rgba(255,255,255,.14)',
                          }}
                        />
                      )}

                      {/* 如期收款:實心 */}
                      <div
                        className="absolute -translate-x-1/2 -translate-y-1/2"
                        style={{ left: '50%', top: onTimeCenter, width: DOT_W, height: DOT_H, borderRadius: 2, background: '#a9e3c1' }}
                      />

                      {/* {label}再延一個月:空心,貼近/跌破安全水位時變紅並帶底色 */}
                      {delayedCenter !== null && (
                        <div
                          className="absolute -translate-x-1/2 -translate-y-1/2"
                          style={{
                            left: '50%', top: delayedCenter, width: DOT_W, height: DOT_H, borderRadius: 2,
                            border: isDanger ? '1.5px solid #e07a7a' : '1.5px solid #d9b56b',
                            background: isDanger ? 'rgba(224,122,122,.2)' : 'transparent',
                          }}
                        />
                      )}

                      {/* 危險週才標紅字提示,其餘週不畫,避免整條線都在喊警報 */}
                      {isDanger && delayedVal !== undefined && (
                        <div
                          className="absolute whitespace-nowrap text-[10px] font-semibold leading-[1.3]"
                          style={{ left: '50%', marginLeft: DOT_W, top: delayedCenter! - 4, color: '#e5a0a0' }}
                        >
                          {fmtK(delayedVal)}<br />已貼水位
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 軌跡文字 */}
          <div className="flex mb-4">
            <div style={{ width: AXIS_W, flexShrink: 0 }} />
            <div className="flex-1 min-w-0 text-[12px] leading-[1.75] tabular-nums" style={{ color: 'var(--nm-text-muted)' }}>
              如期收款 {forecast.balanceTrajectory.map((v) => fmtK(v)).join(' › ')}
              {delayedTrajectory && (
                <>
                  {'　·　延一個月 '}
                  {delayedTrajectory.map((v, i) => (
                    <span key={i}>
                      {i > 0 && ' › '}
                      <span style={i === dangerWeekIndex ? { color: 'var(--nm-danger-glass-text)', fontWeight: 600 } : undefined}>{fmtK(v)}</span>
                    </span>
                  ))}
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* ---- 當週收付明細 ---- */}
      <div className="flex mb-3">
        <div style={{ width: AXIS_W, flexShrink: 0, position: 'relative' }}>
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
        <div style={{ width: AXIS_W, flexShrink: 0 }} />
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
