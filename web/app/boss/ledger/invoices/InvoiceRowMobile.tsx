import Link from 'next/link';
import { LEDGER_JOURNAL_LABEL, type LedgerEntry } from '@/lib/types';

const fmt = (n: number) => n.toLocaleString('zh-TW');

type Row = LedgerEntry & { sites?: { name: string } | null };

function daysElapsed(occurredOn: string, today: string): number {
  const [oy, om, od] = occurredOn.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  const ms = Date.UTC(ty, tm - 1, td) - Date.UTC(oy, om - 1, od);
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export default function InvoiceRowMobile({
  row,
  daysOverdueThreshold,
  today,
}: {
  row: Row;
  daysOverdueThreshold: number;
  today: string;
}) {
  const days = daysElapsed(row.occurred_on, today);
  const overdue = days > daysOverdueThreshold;

  return (
    <div
      className="nm-raised rounded-2xl p-3.5 flex flex-col gap-2"
      style={{ background: overdue ? 'rgba(224,122,122,0.06)' : undefined }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[14px] font-medium" style={{ color: 'var(--nm-text-body)' }}>
          {LEDGER_JOURNAL_LABEL[row.journal]}帳簿
        </span>
        <span className="text-[16px] font-semibold tabular-nums" style={{ color: 'var(--nm-text-body)' }}>
          ${fmt(row.amount_twd)}
        </span>
      </div>
      <div className="text-xs flex flex-wrap gap-x-2 gap-y-1" style={{ color: 'var(--nm-text-secondary)' }}>
        <span>{row.occurred_on}</span>
        {row.party && <span>· {row.party}</span>}
        {row.sites?.name && <span>· {row.sites.name}</span>}
        {row.tax_amount_twd > 0 && <span>· 稅 ${fmt(row.tax_amount_twd)}</span>}
      </div>
      <div>
        <span
          className="nm-pill"
          style={overdue
            ? { color: 'var(--nm-danger-glass-text)', background: 'rgba(224,122,122,0.1)', borderColor: 'rgba(224,122,122,0.28)' }
            : { color: 'var(--nm-warning-glass-text)', background: 'rgba(217,181,107,0.1)', borderColor: 'rgba(217,181,107,0.28)' }}
        >
          {days} 天{overdue ? '(逾期)' : ''}
        </span>
      </div>
      <Link href={`/boss/ledger/${row.id}`} className="underline text-xs self-start" style={{ color: 'var(--nm-text-secondary)' }}>編輯</Link>
    </div>
  );
}
