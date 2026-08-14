import { RECEIVABLE_DIRECTION_LABEL } from '@/lib/types';
import type { ReceivableWithRemaining } from '@/lib/receivables-query';
import StatusButtons from './StatusButtons';

const fmt = (n: number) => n.toLocaleString('zh-TW');

// 桌機看表格,手機看卡片——照 LedgerRowMobile.tsx 的既有模式,900px 寬的表格
// 在手機上要橫向捲動才看得到「動作」欄,新增卡片檢視解掉這個。
export default function ReceivableRowMobile({ row }: { row: ReceivableWithRemaining }) {
  const dirColor = row.direction === 'receivable' ? 'var(--nm-success-glass-text)' : 'var(--nm-danger-glass-text)';

  return (
    <div className="nm-raised rounded-2xl p-3.5 flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[14px] font-medium" style={{ color: dirColor }}>
          {RECEIVABLE_DIRECTION_LABEL[row.direction]} · {row.party}
        </span>
        <span
          className="text-[16px] font-semibold tabular-nums"
          style={{ color: row.overpaid ? 'var(--nm-danger-glass-text)' : 'var(--nm-text-body)' }}
        >
          {row.overpaid ? `超收 $${fmt(Math.abs(row.remaining_twd))}` : `$${fmt(row.remaining_twd)}`}
        </span>
      </div>

      <div className="text-xs flex flex-wrap gap-x-2 gap-y-1" style={{ color: 'var(--nm-text-secondary)' }}>
        {row.sites?.name && <span>{row.sites.name}</span>}
        <span>約定 ${fmt(row.total_amount_twd)}</span>
        <span>已結 ${fmt(row.settled_twd)}</span>
      </div>

      <div>
        {row.status === 'open' && <span className="nm-pill nm-pill-warning">未結</span>}
        {row.status === 'closed' && (
          <span className="nm-pill" style={{ color: 'var(--nm-success-glass-text)', background: 'rgba(126,207,157,0.1)', borderColor: 'rgba(126,207,157,0.28)' }}>已結清</span>
        )}
        {row.status === 'voided' && <span className="nm-pill nm-pill-muted line-through">已作廢</span>}
      </div>

      {row.memo && (
        <div className="text-xs" style={{ color: 'var(--nm-text-secondary)' }}>{row.memo}</div>
      )}

      <div className="pt-1">
        <StatusButtons id={row.id} status={row.status} remainingTwd={row.remaining_twd} direction={row.direction} />
      </div>
    </div>
  );
}
