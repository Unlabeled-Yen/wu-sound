import type { QuoteLine } from '@/lib/types';
import QuoteLineRow from './QuoteLineRow';

const fmt = (n: number) => n.toLocaleString('zh-TW');

// 分區:標題 + 一條比列分隔線重的橫線,不再各自成卡(Gestalt 共同區域——
// 一份單據用一個連續容器,不是六張卡片邊框堆疊)。
export function QuoteSection({
  title, rows, subtotal, missingCount, quoteId, costByItemId, onChanged, onDeleted,
  showMargin, onToggleMargin, showMarginToggle, missingRowRef,
}: {
  title: string;
  rows: QuoteLine[];
  subtotal: number;
  missingCount: number;
  quoteId: string;
  costByItemId: Record<string, number | null>;
  onChanged: (l: QuoteLine) => void;
  onDeleted: (id: string) => void;
  showMargin: boolean;
  onToggleMargin?: () => void;
  showMarginToggle?: boolean;
  missingRowRef?: (lineId: string, el: HTMLInputElement | null) => void;
}) {
  const subtotalLabel = missingCount > 0 ? `${title}小計(不含待補價 ${missingCount} 項)` : `${title}小計`;

  return (
    <div style={{ padding: '20px 26px 0' }}>
      <div className="flex items-baseline justify-between" style={{ paddingBottom: 12, borderBottom: '1px solid rgba(255,255,255,.14)' }}>
        <div className="text-[14px] font-semibold" style={{ color: 'var(--nm-text-primary)' }}>{title}</div>
        {showMarginToggle && (
          <label className="print-hide flex items-center gap-2 text-[11.5px] cursor-pointer" style={{ color: 'var(--nm-text-faint)' }}>
            顯示毛利
            <span className="relative inline-block" style={{ width: 30, height: 17 }}>
              <input type="checkbox" checked={showMargin} onChange={onToggleMargin} className="absolute inset-0 opacity-0 cursor-pointer" />
              <span
                className="absolute inset-0 rounded-full transition-colors"
                style={{ background: showMargin ? 'rgba(126,207,157,.35)' : 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.18)' }}
              />
              <span
                className="absolute rounded-full transition-transform"
                style={{ width: 11, height: 11, top: 2, left: 2, background: showMargin ? 'var(--nm-success)' : '#6d6e73', transform: showMargin ? 'translateX(13px)' : 'none' }}
              />
            </span>
          </label>
        )}
      </div>

      <div>
        {rows.length === 0 && (
          <div className="py-6 text-center text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>此區還沒有明細</div>
        )}
        {rows.map((line, i) => (
          <QuoteLineRow
            key={line.id}
            line={line}
            index={i}
            quoteId={quoteId}
            unitCost={line.catalog_item_id ? costByItemId[line.catalog_item_id] : undefined}
            onChanged={onChanged}
            onDeleted={onDeleted}
            showMargin={showMargin}
            priceInputRef={missingRowRef ? (el) => missingRowRef(line.id, el) : undefined}
          />
        ))}
      </div>

      {rows.length > 0 && (
        <div className="flex items-center gap-4 py-3.5">
          <div className="w-[18px] shrink-0" />
          <div className="flex-1 text-[12.5px]" style={{ color: 'var(--nm-text-muted)' }}>{subtotalLabel}</div>
          <div className="w-[120px] shrink-0 text-right text-[15px] font-semibold tabular-nums" style={{ color: 'var(--nm-text-body)' }}>${fmt(subtotal)}</div>
          <div className="w-6 shrink-0 print-hide" />
        </div>
      )}
    </div>
  );
}
