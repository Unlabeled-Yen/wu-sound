import Link from 'next/link';
import { LEDGER_KIND_LABEL, INVOICE_STATUS_LABEL, type LedgerEntry } from '@/lib/types';
import { VoidDialog } from './VoidDialog';

const fmt = (n: number) => n.toLocaleString('zh-TW');

// v2 桌機列表固定高度(監測帶要常駐,列表不能把它推出視野),內部捲動;
// v3 併入「已收付」分頁後改用外層 flex-1 撐滿分頁高度,不再自帶固定數字
// (見 SettledReceivablesViews.tsx 的 SettledView)。手機維持頁面捲動。

export type SettledEntry = LedgerEntry & { sites?: { name: string } | null };

// 本月已收付明細(單一方向,收入或支出各自一份)。每列在金額下方加一條 2px 佔比條,
// 寬度＝該列金額 ÷ 本欄本月合計——回答「這幾筆裡誰佔比較重」,不是拿來跨欄比較
// (比例以本欄自身 100% 計)。v3 併入原本「已收付」表格的能力(編輯/作廢/發票狀態/
// 歸屬/備註),取代 8 欄橫向捲動表格——同一份資訊,列式排版不用橫捲。
export function SettledMonthList({ title, tone, items, columnTotal }: {
  title: string;
  tone: 'income' | 'expense';
  items: SettledEntry[];
  columnTotal: number;
}) {
  const barColor = tone === 'income' ? 'var(--nm-success)' : 'var(--nm-danger)';
  const textColor = tone === 'income' ? 'var(--nm-success-glass-text)' : 'var(--nm-danger-glass-text)';
  const settledLabel = tone === 'income' ? '已收' : '已付';

  return (
    <div className="flex flex-col gap-2 min-w-0 lg:h-full lg:min-h-0">
      <div className="flex items-baseline justify-between shrink-0">
        <div className="text-[15px] font-semibold" style={{ color: 'var(--nm-text-primary)' }}>{title}</div>
        <div className="text-[11px]" style={{ color: 'var(--nm-text-faint)' }}>{items.length} 筆 · 佔比以本欄自身 100% 計</div>
      </div>

      {items.length === 0 && (
        <div className="rounded-2xl nm-raised flex items-center justify-center" style={{ height: 120 }}>
          <p className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>本月沒有已{settledLabel.slice(1)}紀錄</p>
        </div>
      )}

      {items.length > 0 && (
        <div className="lg:flex-1 lg:min-h-0 app-scroll lg:overflow-y-auto lg:pr-1">
          {items.map((r) => {
            const voided = r.state === 'voided';
            const pct = columnTotal > 0 && !voided ? Math.min(100, (r.amount_twd / columnTotal) * 100) : 0;
            const meta = [
              settledLabel,
              r.is_external ? '外帳' : '內帳',
              r.occurred_on,
              r.sites?.name ?? '專案外',
              r.invoice_status !== 'none' ? INVOICE_STATUS_LABEL[r.invoice_status] : null,
            ].filter(Boolean).join(' · ');
            return (
              <div key={r.id} className="py-[14px]" style={{ borderBottom: '1px solid var(--nm-border-hair)', opacity: voided ? 0.5 : 1 }}>
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-medium truncate flex items-center gap-1.5 flex-wrap" style={{ color: 'var(--nm-text-body)' }}>
                      <span>{LEDGER_KIND_LABEL[r.kind]}{r.party ? `　${r.party}` : ''}</span>
                      {r.source_batch_id && <span className="nm-pill nm-pill-muted">薪資結算匯入</span>}
                      {r.to_check && <span className="nm-pill nm-pill-warning">待確認</span>}
                    </div>
                    <div className="text-xs mt-1" style={{ color: 'var(--nm-text-muted)' }}>{meta}</div>
                    {r.memo && !voided && <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--nm-text-secondary)' }}>{r.memo}</div>}
                    {voided && r.voided_reason && <div className="text-xs mt-0.5" style={{ color: 'var(--nm-text-muted)' }}>作廢原因:{r.voided_reason}</div>}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className={`text-[15px] font-semibold tabular-nums ${voided ? 'line-through' : ''}`} style={{ color: textColor }}>${fmt(r.amount_twd)}</span>
                    {!voided && (
                      <div className="flex gap-2 items-center text-[12px]">
                        <Link href={`/boss/ledger/${r.id}`} className="underline" style={{ color: 'var(--nm-text-muted)' }}>編輯</Link>
                        <VoidDialog id={r.id} summary={`${r.occurred_on} · ${LEDGER_KIND_LABEL[r.kind]} · ${r.party ?? '—'} · $${fmt(r.amount_twd)}`} />
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-2 h-[2px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,.06)' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: barColor, opacity: 0.7 }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
