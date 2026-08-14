import Link from 'next/link';
import { LEDGER_KIND_LABEL, INVOICE_STATUS_LABEL, type LedgerEntry } from '@/lib/types';
import { VoidDialog } from './VoidDialog';

const fmt = (n: number) => n.toLocaleString('zh-TW');

type Row = LedgerEntry & { sites?: { name: string } | null };

// 桌機看表格,手機看卡片——原本 1100px 寬的表格在手機上完全打不開,只能橫向捲動找欄位。
export default function LedgerRowMobile({ row }: { row: Row }) {
  const voided = row.status === 'voided';
  return (
    <div className="nm-raised rounded-2xl p-3.5 flex flex-col gap-2" style={{ opacity: voided ? 0.5 : 1 }}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {row.direction === 'income'
            ? <span style={{ color: 'var(--nm-success-glass-text)' }}>↑</span>
            : <span style={{ color: 'var(--nm-danger-glass-text)' }}>↓</span>}
          <span className="text-[14px] font-medium truncate" style={{ color: 'var(--nm-text-body)' }}>
            {LEDGER_KIND_LABEL[row.kind]}
          </span>
        </div>
        <span
          className={`text-[16px] font-semibold tabular-nums whitespace-nowrap ${voided ? 'line-through' : ''}`}
          style={{ color: 'var(--nm-text-body)' }}
        >
          ${fmt(row.amount_twd)}
        </span>
      </div>

      <div className="text-xs flex flex-wrap gap-x-2 gap-y-1" style={{ color: 'var(--nm-text-secondary)' }}>
        <span>{row.occurred_on}</span>
        {row.party && <span>· {row.party}</span>}
        {row.sites?.name && <span>· {row.sites.name}</span>}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className={`nm-pill ${row.is_external ? 'nm-pill-neutral' : 'nm-pill-muted'}`}>{row.is_external ? '外帳' : '內帳'}</span>
        {row.source_batch_id && <span className="nm-pill nm-pill-muted">薪資結算匯入</span>}
        {row.to_check && <span className="nm-pill nm-pill-warning">待確認</span>}
        {row.invoice_status === 'to_issue' && <span className="nm-pill nm-pill-warning">{INVOICE_STATUS_LABEL.to_issue}</span>}
        {row.invoice_status === 'issued' && (
          <span className="nm-pill" style={{ color: 'var(--nm-success-glass-text)', background: 'rgba(126,207,157,0.1)', borderColor: 'rgba(126,207,157,0.28)' }}>
            {INVOICE_STATUS_LABEL.issued}
          </span>
        )}
      </div>

      {row.memo && (
        <div className="text-xs" style={{ color: 'var(--nm-text-secondary)' }}>{row.memo}</div>
      )}
      {voided && row.voided_reason && (
        <div className="text-xs" style={{ color: 'var(--nm-text-muted)' }}>作廢原因:{row.voided_reason}</div>
      )}

      {!voided && (
        <div className="flex gap-3 pt-1 text-xs">
          <Link href={`/boss/ledger/${row.id}`} className="underline" style={{ color: 'var(--nm-text-secondary)' }}>編輯</Link>
          <VoidDialog
            id={row.id}
            summary={`${row.occurred_on} · ${LEDGER_KIND_LABEL[row.kind]} · ${row.party ?? '—'} · $${fmt(row.amount_twd)}`}
          />
        </div>
      )}
    </div>
  );
}
