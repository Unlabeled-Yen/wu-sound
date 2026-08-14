import type { CashForecast } from '@/lib/ledger-cash-forecast';

const fmt = (n: number) => n.toLocaleString('zh-TW');

function weekLabel(w: { from: string; to: string }, idx: number): string {
  const short = (s: string) => s.slice(5).replace('-', '/');
  return idx === 0 ? `本週 ${short(w.from)}` : `第 ${idx + 1} 週 ${short(w.from)}`;
}

// 未來四週現金:原型的雙帶設計(餘額帶＋當週收付帶)裡,餘額帶需要「現金起點」與
// 「安全水位」——這兩個數字在這個系統裡沒有任何資料來源(沒有銀行餘額追蹤功能),
// 硬填會是編數字,所以本版只做當週收付帶,餘額曲線留待日後有現金餘額功能再補。
//
// 全部是預估(依約定日推算),資料層與已收付彙總分開回傳,這裡不做任何「這筆錢
// 一定會準時進來」的假設——如期與逾期用不同顏色區分,未排定日期的金額獨立顯示,
// 不會被藏進某一週假裝已經排定。
export function CashForecastTimeline({ forecast }: { forecast: CashForecast }) {
  const maxAmount = Math.max(
    1,
    ...forecast.weeks.map((w) => w.incomeTwd),
    ...forecast.weeks.map((w) => w.expenseTwd),
  );
  const hasUnscheduled = forecast.unscheduledIncomeTwd > 0 || forecast.unscheduledExpenseTwd > 0;
  const hasBeyond = forecast.beyondIncomeTwd > 0 || forecast.beyondExpenseTwd > 0;

  return (
    <div className="rounded-2xl nm-raised p-4">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <div className="text-[15px] font-semibold" style={{ color: 'var(--nm-text-primary)' }}>未來四週現金</div>
        <div className="text-[12px]" style={{ color: 'var(--nm-text-faint)' }}>依約定收款日／到期日排入週次,全是預估,不與已收付合計</div>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {forecast.weeks.map((w, idx) => {
          const incomePct = (w.incomeTwd / maxAmount) * 100;
          const expensePct = (w.expenseTwd / maxAmount) * 100;
          const overdueInWeek0 = idx === 0 && (forecast.overdueIncomeTwd > 0 || forecast.overdueExpenseTwd > 0);
          return (
            <div key={idx}>
              <div className="flex items-center justify-between text-[12px] mb-1">
                <span style={{ color: 'var(--nm-text-secondary)' }}>{weekLabel(w, idx)}</span>
                {overdueInWeek0 && (
                  <span className="nm-pill" style={{ color: 'var(--nm-danger-glass-text)', background: 'rgba(224,122,122,0.1)', borderColor: 'rgba(224,122,122,0.3)' }}>
                    含已逾期 收 ${fmt(forecast.overdueIncomeTwd)} · 付 ${fmt(forecast.overdueExpenseTwd)}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="w-8 text-[11px] shrink-0" style={{ color: 'var(--nm-success-glass-text)' }}>進帳</span>
                  <div className="flex-1 h-4 rounded overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    {w.incomeTwd > 0 && <div className="h-full rounded" style={{ width: `${incomePct}%`, background: 'var(--nm-success-glass-text)' }} />}
                  </div>
                  <span className="w-24 text-right text-[12px] tabular-nums shrink-0" style={{ color: 'var(--nm-text-body)' }}>${fmt(w.incomeTwd)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-8 text-[11px] shrink-0" style={{ color: 'var(--nm-danger-glass-text)' }}>付出</span>
                  <div className="flex-1 h-4 rounded overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    {w.expenseTwd > 0 && <div className="h-full rounded" style={{ width: `${expensePct}%`, background: 'var(--nm-danger-glass-text)' }} />}
                  </div>
                  <span className="w-24 text-right text-[12px] tabular-nums shrink-0" style={{ color: 'var(--nm-text-body)' }}>${fmt(w.expenseTwd)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {(hasUnscheduled || hasBeyond) && (
        <div className="mt-3 pt-3 text-[12px] flex flex-col gap-1" style={{ borderTop: '1px solid var(--nm-border-hair)', color: 'var(--nm-text-muted)' }}>
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
