import type { CashForecast } from '@/lib/ledger-cash-forecast';

const fmt = (n: number) => n.toLocaleString('zh-TW');

function weekLabel(w: { from: string; to: string }, idx: number): { title: string; range: string } {
  const short = (s: string) => s.slice(5).replace('-', '/');
  return { title: `第 ${idx + 1} 週`, range: `${short(w.from)}–${short(w.to)}` };
}

// 當週收付帶的長條共用同一個 px/$1K 係數(0.55,照抄原型 7a 的實測值:
// 86K→47px、45K→25px、120K→66px、62K→34px、28K→15px),不是各自正規化到當週最大值——
// 那樣兩週之間的長條會失去可比性,違反「圖表比例算錯」的十大常見錯誤第 9 條。
const PX_PER_1K = 0.55;
const CHART_HEIGHT = 120;
const ZERO_LINE_FROM_TOP = 68; // 與原型一致:進帳在上、付出在下,零軸不置中
const MAX_BAR = Math.min(ZERO_LINE_FROM_TOP, CHART_HEIGHT - ZERO_LINE_FROM_TOP) - 6;

function barHeightPx(amountTwd: number): number {
  return Math.max(0, Math.min(MAX_BAR, (amountTwd / 1000) * PX_PER_1K));
}

// 未來四週現金:原型的雙帶設計(餘額帶＋當週收付帶)裡,餘額帶需要「現金起點」與
// 「安全水位」——這兩個數字在這個系統裡沒有任何資料來源(沒有銀行餘額追蹤功能),
// 硬填會是編數字,所以本版只做當週收付帶,餘額曲線留待日後有現金餘額功能再補。
//
// 實心／空心的區分:本週(week0)常常混了已逾期與剛到期的金額,較確定,畫實心;
// 第 2-4 週是還沒到期的未來預估,較不確定,畫空心——這是週次層級的近似,不是
// 逐筆判斷(逐筆需要在分桶時保留單筆的逾期狀態,目前的資料結構只到週次加總)。
export function CashForecastTimeline({ forecast }: { forecast: CashForecast }) {
  const hasUnscheduled = forecast.unscheduledIncomeTwd > 0 || forecast.unscheduledExpenseTwd > 0;
  const hasBeyond = forecast.beyondIncomeTwd > 0 || forecast.beyondExpenseTwd > 0;

  return (
    <div className="rounded-2xl nm-raised p-5">
      <div className="flex items-baseline justify-between gap-2 flex-wrap mb-2.5">
        <div className="text-[15px] font-semibold" style={{ color: 'var(--nm-text-primary)' }}>未來四週現金</div>
      </div>
      <div className="text-[12.5px] leading-[1.7] mb-5" style={{ color: 'var(--nm-text-secondary)' }}>
        依未收帳款的約定收款日與未付款到期日排入週次,全是預估,不與已收付合計。
      </div>

      <div className="flex items-center gap-5 mb-4 text-[11.5px]" style={{ color: 'var(--nm-text-secondary)' }}>
        <span className="flex items-center gap-1.5"><span style={{ width: 11, height: 11, background: 'var(--nm-success-glass-text)', borderRadius: 2, display: 'inline-block' }} />本週(較確定)</span>
        <span className="flex items-center gap-1.5"><span style={{ width: 11, height: 11, border: '1.5px solid var(--nm-warning)', borderRadius: 2, display: 'inline-block' }} />未來預估(空心)</span>
      </div>

      {/* 當週收付帶:單一尺度,零軸不置中——進帳在上、付出在下,兩者共用同一個 px/$1K 係數。 */}
      <div className="flex mb-3">
        <div style={{ width: 60, flexShrink: 0, position: 'relative', height: CHART_HEIGHT }}>
          <div style={{ position: 'absolute', top: ZERO_LINE_FROM_TOP - 22, right: 8, fontSize: 10.5, color: 'var(--nm-text-faint)', textAlign: 'right' }}>當週<br />進帳</div>
          <div style={{ position: 'absolute', top: ZERO_LINE_FROM_TOP + 8, right: 8, fontSize: 10.5, color: 'var(--nm-text-faint)', textAlign: 'right' }}>當週<br />付出</div>
        </div>
        <div className="flex-1 flex" style={{ position: 'relative', height: CHART_HEIGHT, borderLeft: '1px solid var(--nm-border-glass)' }}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: ZERO_LINE_FROM_TOP, height: 1, background: 'var(--nm-border-glass)' }} />
          {forecast.weeks.map((w, idx) => {
            const solid = idx === 0;
            const incomeH = barHeightPx(w.incomeTwd);
            const expenseH = barHeightPx(w.expenseTwd);
            return (
              <div key={idx} className="flex-1" style={{ position: 'relative', borderRight: idx < 3 ? '1px solid var(--nm-border-hair)' : undefined }}>
                {w.incomeTwd > 0 && (
                  <div
                    className="flex flex-col justify-center px-2"
                    style={{
                      position: 'absolute', left: 8, right: 8, bottom: CHART_HEIGHT - ZERO_LINE_FROM_TOP + 2, height: incomeH,
                      borderRadius: 4,
                      background: solid ? 'rgba(126,207,157,.82)' : 'rgba(126,207,157,.14)',
                      border: solid ? undefined : '1.5px solid var(--nm-success)',
                    }}
                  >
                    <span className="tabular-nums" style={{ fontSize: 12, fontWeight: 600, color: solid ? '#17171a' : 'var(--nm-success-glass-text)' }}>＋${fmt(w.incomeTwd)}</span>
                  </div>
                )}
                {w.expenseTwd > 0 && (
                  <div
                    className="flex flex-col justify-center px-2"
                    style={{
                      position: 'absolute', left: 8, right: 8, top: ZERO_LINE_FROM_TOP + 2, height: expenseH,
                      borderRadius: 4,
                      background: solid ? 'rgba(224,122,122,.8)' : 'rgba(224,122,122,.14)',
                      border: solid ? undefined : '1.5px solid var(--nm-danger)',
                    }}
                  >
                    <span className="tabular-nums" style={{ fontSize: 11.5, fontWeight: 600, color: solid ? '#17171a' : 'var(--nm-danger-glass-text)' }}>－${fmt(w.expenseTwd)}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 週標籤列,與圖表左側軸標欄同寬留白對齊 */}
      <div className="flex mb-4">
        <div style={{ width: 60, flexShrink: 0 }} />
        <div className="flex-1 flex">
          {forecast.weeks.map((w, idx) => {
            const { title, range } = weekLabel(w, idx);
            return (
              <div key={idx} className="flex-1 px-2">
                <div className="text-[12.5px] font-medium" style={{ color: 'var(--nm-text-body)' }}>{idx === 0 ? '本週' : title}</div>
                <div className="text-[11px]" style={{ color: 'var(--nm-text-faint)' }}>{range}</div>
              </div>
            );
          })}
        </div>
      </div>

      {(hasUnscheduled || hasBeyond) && (
        <div className="pt-3 text-[12px] flex flex-col gap-1" style={{ borderTop: '1px solid var(--nm-border-hair)', color: 'var(--nm-text-muted)' }}>
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

      <div className="mt-3 pt-3 text-[11px]" style={{ borderTop: '1px solid var(--nm-border-hair)', color: 'var(--nm-text-faint)' }}>
        本版只顯示當週收付金額,不含現金餘額曲線——系統目前沒有追蹤銀行/現金餘額,無法算出可信的起點與安全水位,留待該功能上線後再補。
      </div>
    </div>
  );
}
