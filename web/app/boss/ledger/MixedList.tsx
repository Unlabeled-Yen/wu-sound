import { LEDGER_KIND_LABEL, type LedgerEntry } from '@/lib/types';
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
// 桌機是扁平列(左側 3px 色條 + 下緣 hair 線),不是卡片——原型 7a 的 inline style
// 逐行核對過:未結一律走黃色軸(色條與金額文字都是,不分收入/支出方向),已結才
// 走收入/支出方向色(色條用基礎色、金額文字用 glass-text 變體)。手機保留卡片。
export function MixedList({ title, tone, unsettledItems, settledItems }: {
  title: string;
  tone: 'income' | 'expense';
  unsettledItems: Extract<AllListItem, { type: 'receivable' }>[];
  settledItems: Extract<AllListItem, { type: 'entry' }>[];
}) {
  const settledBarColor = tone === 'income' ? 'var(--nm-success)' : 'var(--nm-danger)';
  const settledTextColor = tone === 'income' ? 'var(--nm-success-glass-text)' : 'var(--nm-danger-glass-text)';
  const total = unsettledItems.length + settledItems.length;
  const unsettledLabel = tone === 'income' ? '未收' : '未付';
  const settledLabel = tone === 'income' ? '已收' : '已付';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <div className="text-[15px] font-semibold" style={{ color: 'var(--nm-text-primary)' }}>{title}</div>
        <div className="text-[12px]" style={{ color: 'var(--nm-text-muted)' }}>{total} 筆 · 未結{unsettledItems.length}筆在最上</div>
      </div>

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

          {/* 桌機:扁平列,左側 3px 黃色條(結清狀態軸,不分收入/支出方向) */}
          <div className="hidden lg:flex flex-col">
            {unsettledItems.map((item) => {
              const r = item.row;
              const meta = r.settled_twd > 0
                ? `${unsettledLabel} · 約定 $${fmt(r.total_amount_twd)} ${settledLabel} $${fmt(r.settled_twd)}`
                : `${unsettledLabel} · ${r.sites?.name ?? '專案外'} · 約定 $${fmt(r.total_amount_twd)}`;
              return (
                <div key={`r-${r.id}`} className="flex items-center gap-3 py-[18px]" style={{ borderBottom: '1px solid var(--nm-border-hair)' }}>
                  <span className="shrink-0" style={{ width: 3, height: 34, background: 'var(--nm-warning)', borderRadius: 2 }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-medium truncate" style={{ color: 'var(--nm-text-body)' }}>{r.party}</div>
                    <div className="text-xs mt-1" style={{ color: 'var(--nm-text-muted)' }}>{meta}</div>
                  </div>
                  <span className="text-[16px] font-semibold tabular-nums shrink-0" style={{ color: r.overpaid ? 'var(--nm-danger-glass-text)' : 'var(--nm-warning-glass-text)' }}>
                    {r.overpaid ? `超收 $${fmt(Math.abs(r.remaining_twd))}` : `$${fmt(r.remaining_twd)}`}
                  </span>
                  <div className="shrink-0"><StatusButtons id={r.id} status={r.status} remainingTwd={r.remaining_twd} direction={tone === 'income' ? 'receivable' : 'payable'} /></div>
                </div>
              );
            })}
          </div>

          {/* 手機:維持卡片(空心描邊,幾何編碼) */}
          <div className="lg:hidden flex flex-col gap-2">
            {unsettledItems.map((item) => (
              <div key={`r-${item.row.id}`} className="rounded-2xl p-3.5 flex flex-col gap-2" style={{ border: '1.5px solid var(--nm-warning)', background: 'transparent' }}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[14px] font-medium truncate" style={{ color: 'var(--nm-text-body)' }}>{item.row.party}</span>
                  <span className="text-[16px] font-semibold tabular-nums" style={{ color: item.row.overpaid ? 'var(--nm-danger-glass-text)' : 'var(--nm-warning-glass-text)' }}>
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
                  <StatusButtons id={item.row.id} status={item.row.status} remainingTwd={item.row.remaining_twd} direction={tone === 'income' ? 'receivable' : 'payable'} />
                </div>
              </div>
            ))}
          </div>
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

          {/* 桌機:扁平列,左側 3px 色條走收入/支出方向色(基礎色),金額用 glass-text 變體。 */}
          <div className="hidden lg:flex flex-col">
            {settledItems.map((item) => {
              const r = item.row;
              const voided = r.state === 'voided';
              const meta = [settledLabel, r.is_external ? '外帳' : '內帳', r.to_check ? 'AI 待確認' : null, r.occurred_on].filter(Boolean).join(' · ');
              return (
                <div key={`e-${r.id}`} className="flex items-center gap-3 py-[18px]" style={{ borderBottom: '1px solid var(--nm-border-hair)', opacity: voided ? 0.5 : 1 }}>
                  <span className="shrink-0" style={{ width: 3, height: 34, background: settledBarColor, borderRadius: 2 }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-medium truncate" style={{ color: 'var(--nm-text-body)' }}>{LEDGER_KIND_LABEL[r.kind]}{r.party ? `　${r.party}` : ''}</div>
                    <div className="text-xs mt-1" style={{ color: 'var(--nm-text-muted)' }}>{meta}</div>
                  </div>
                  <span className={`text-[16px] font-semibold tabular-nums shrink-0 ${voided ? 'line-through' : ''}`} style={{ color: settledTextColor }}>${fmt(r.amount_twd)}</span>
                </div>
              );
            })}
          </div>

          {/* 手機:維持卡片 */}
          <div className="lg:hidden flex flex-col gap-2">
            {settledItems.map((item) => (
              <LedgerRowMobile key={`e-${item.row.id}`} row={item.row} showSettledBadge />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
