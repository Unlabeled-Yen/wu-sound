import type { LedgerEntry } from '@/lib/types';
import type { ReceivableWithRemaining } from '@/lib/receivables-query';
import LedgerRowMobile from './LedgerRowMobile';
import StatusButtons from './receivables/StatusButtons';

const fmt = (n: number) => n.toLocaleString('zh-TW');

export type AllListItem =
  | { type: 'entry'; row: LedgerEntry & { sites?: { name: string } | null } }
  | { type: 'receivable'; row: ReceivableWithRemaining };

// 收入/支出混排列表:取消原本固定 560px、內部捲動的面板,改成跟著頁面捲動——
// 一份帳可能有 120 筆,鎖在一個小窗格裡等於逼人在窗格內再捲一次。分段標頭
// (未結約定/已收付)在捲動時吸頂,取代原本靠面板邊界分隔。
//
// 卡片形狀是第二編碼的另一種展現:已結分錄＝實心底卡(nm-raised),未結約定＝
// 空心描邊卡——不只靠顏色,形狀本身就在說「這筆錢動了沒」。
export function MixedList({ title, tone, unsettledItems, settledItems }: {
  title: string;
  tone: 'income' | 'expense';
  unsettledItems: Extract<AllListItem, { type: 'receivable' }>[];
  settledItems: Extract<AllListItem, { type: 'entry' }>[];
}) {
  const toneColor = tone === 'income' ? 'var(--nm-success-glass-text)' : 'var(--nm-danger-glass-text)';
  const total = unsettledItems.length + settledItems.length;
  const unsettledLabel = tone === 'income' ? '未收' : '未付';
  const settledLabel = tone === 'income' ? '已收' : '已付';

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[15px] font-semibold" style={{ color: toneColor }}>{title} · {total} 筆</div>

      {total === 0 && (
        <p className="text-[13px] text-center py-6" style={{ color: 'var(--nm-text-secondary)' }}>沒有紀錄</p>
      )}

      {unsettledItems.length > 0 && (
        <div className="flex flex-col">
          <div
            className="sticky top-0 z-10 text-[11px] uppercase tracking-wide py-1.5 px-0.5"
            style={{ color: 'var(--nm-warning)', background: 'var(--nm-bg)' }}
          >
            {unsettledLabel}約定 {unsettledItems.length} 筆
          </div>
          {unsettledItems.map((item) => (
            // 未結卡的邊框走「結清狀態」色軸(黃=未結),不是「收入/支出」色軸(綠/紅)——
            // 兩條色軸各自負責不同的資訊,混在一起會讓「這筆還沒收/付」的訊號被方向色蓋過去。
            <div key={`r-${item.row.id}`} className="rounded-2xl p-3.5 flex flex-col gap-2 mb-2" style={{ border: '1.5px solid var(--nm-warning)', background: 'transparent' }}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[14px] font-medium truncate" style={{ color: 'var(--nm-text-body)' }}>{item.row.party}</span>
                <span className="text-[16px] font-semibold tabular-nums" style={{ color: item.row.overpaid ? 'var(--nm-danger-glass-text)' : toneColor }}>
                  {item.row.overpaid ? `超收 $${fmt(Math.abs(item.row.remaining_twd))}` : `$${fmt(item.row.remaining_twd)}`}
                </span>
              </div>
              <div className="text-xs flex flex-wrap gap-x-2 gap-y-1" style={{ color: 'var(--nm-text-secondary)' }}>
                {item.row.sites?.name ? <span>{item.row.sites.name}</span> : <span style={{ color: 'var(--nm-text-faint)' }}>專案外</span>}
                <span>約定 ${fmt(item.row.total_amount_twd)}</span>
                <span>{item.row.agreed_due_date ? `約定日 ${item.row.agreed_due_date}` : '未排定日期'}</span>
              </div>
              <div className="flex items-center justify-between pt-0.5">
                <span className="nm-pill nm-pill-warning">{unsettledLabel}</span>
                <StatusButtons id={item.row.id} status={item.row.status} />
              </div>
            </div>
          ))}
        </div>
      )}

      {settledItems.length > 0 && (
        <div className="flex flex-col">
          <div
            className="sticky top-0 z-10 text-[11px] uppercase tracking-wide py-1.5 px-0.5"
            style={{ color: 'var(--nm-text-muted)', background: 'var(--nm-bg)' }}
          >
            {settledLabel} {settledItems.length} 筆
          </div>
          <div className="flex flex-col gap-2">
            {settledItems.map((item) => (
              <LedgerRowMobile key={`e-${item.row.id}`} row={item.row} showSettledBadge />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
