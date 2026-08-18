import Link from 'next/link';
import type { SiteReport, SiteReportRow } from '@/lib/ledger-report-site';
import { fmt, NO_SITE } from './ledger-page-helpers';
import { NumberCell } from './ReportsCategoryTable';

// 22c 主表——按案子維度(＝傳統的專案損益表)。見 17-reports-center.md §5-5。
// 「未歸類」殘差列是原生結構,不是額外要求——切維度必然有切不到的殘差(R4)。
export function ReportsSiteTable({ report, drillHref }: {
  report: SiteReport;
  drillHref: (siteId: string) => string;
}) {
  const mono = 'var(--font-geist-mono),monospace';
  return (
    <table data-report-table="site" style={{ width: '100%', borderCollapse: 'collapse' }}>
      <colgroup>
        <col />
        <col style={{ width: 132 }} />
        <col style={{ width: 148 }} />
        <col style={{ width: 112 }} />
        <col style={{ width: 148 }} />
        <col style={{ width: 88 }} />
      </colgroup>
      <thead>
        <tr style={{ borderBottom: '1px solid rgba(255,255,255,.16)' }}>
          <th style={thStyle('left')}>案子</th>
          <th style={thStyle('right')}>收入</th>
          <th style={thStyle('right')}>直接成本</th>
          <th style={thStyle('right')}>代墊</th>
          <th style={thStyle('right')}>毛利</th>
          <th style={thStyle('right')}>毛利率</th>
        </tr>
      </thead>
      <tbody>
        {report.rows.length === 0 && !report.residual && (
          <tr><td colSpan={6} style={{ padding: '16px 0', textAlign: 'center', color: 'var(--nm-text-faint)', fontSize: 13 }}>這段期間沒有帳目</td></tr>
        )}
        {report.rows.map((r) => <SiteRow key={r.siteId} row={r} href={drillHref(r.siteId!)} mono={mono} />)}
        {report.residual && <SiteRow row={report.residual} href={drillHref(NO_SITE)} residual mono={mono} />}
        <TotalRow row={report.total} mono={mono} />
      </tbody>
    </table>
  );
}

function thStyle(align: 'left' | 'right'): React.CSSProperties {
  return { padding: '8px 0', textAlign: align, font: '400 10px/1 inherit', letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--nm-text-muted)' };
}

function SiteRow({ row, href, residual, mono }: { row: SiteReportRow; href?: string; residual?: boolean; mono: string }) {
  return (
    <tr
      style={{ borderBottom: '1px solid ' + (residual ? 'rgba(255,255,255,.16)' : 'var(--nm-border-hair)'), background: residual ? 'rgba(217,181,107,.05)' : undefined }}
      data-site-row
      data-residual={residual ? true : undefined}
      data-revenue={row.revenue}
      data-cost={row.directCost}
      data-advance={row.advance}
      data-margin={row.margin}
    >
      <td style={{ padding: '9px 0', font: `400 13px/1.4 inherit`, color: residual ? 'var(--nm-warning-glass-text)' : 'var(--nm-text-body)', fontWeight: residual ? 500 : 400 }} data-drill={href ? true : undefined}>
        {href ? <Link href={href} style={{ color: 'inherit', textDecoration: 'none' }}>{row.label}</Link> : row.label}
      </td>
      <NumTd value={row.revenue} mono={mono} />
      <NumTd value={-row.directCost} mono={mono} />
      <NumTd value={-row.advance} mono={mono} />
      <NumTd value={row.margin} mono={mono} isVerdict />
      <MarginRateTd rate={row.marginRate} mono={mono} />
    </tr>
  );
}

function TotalRow({ row, mono }: { row: SiteReportRow; mono: string }) {
  return (
    <tr style={{ background: 'rgba(255,255,255,.03)' }} data-total="site" data-revenue={row.revenue} data-cost={row.directCost} data-advance={row.advance} data-margin={row.margin}>
      <td style={{ padding: '13px 0 13px 10px', font: '500 14px/1.4 inherit', color: 'var(--nm-text-primary)' }}>合計</td>
      <td style={{ padding: '13px 0', textAlign: 'right', font: `500 13.5px/1 ${mono}` }} className="tabular-nums"><NumberCell value={row.revenue} /></td>
      <td style={{ padding: '13px 0', textAlign: 'right', font: `500 13.5px/1 ${mono}` }} className="tabular-nums"><NumberCell value={-row.directCost} /></td>
      <td style={{ padding: '13px 0', textAlign: 'right', font: `500 13.5px/1 ${mono}` }} className="tabular-nums"><NumberCell value={-row.advance} /></td>
      <td style={{ padding: '13px 10px 13px 0', textAlign: 'right', font: `600 19px/1 ${mono}` }} className="tabular-nums" data-headline data-verdict-cell>
        <NumberCell value={row.margin} showTriangleWhenNegative />
      </td>
      <MarginRateTd rate={row.marginRate} mono={mono} />
    </tr>
  );
}

function NumTd({ value, mono, isVerdict }: { value: number; mono: string; isVerdict?: boolean }) {
  return (
    <td style={{ padding: '9px 0', textAlign: 'right', font: `400 13px/1.4 ${mono}` }} className="tabular-nums" data-verdict-cell={isVerdict ? true : undefined}>
      <NumberCell value={value} showTriangleWhenNegative={isVerdict} />
    </td>
  );
}

function MarginRateTd({ rate, mono }: { rate: number | null; mono: string }) {
  if (rate === null) return <td style={{ padding: '9px 0', textAlign: 'right', font: `400 12.5px/1 ${mono}`, color: 'var(--nm-text-faint)' }}>—</td>;
  const color = rate >= 0 ? 'var(--nm-success-glass-text)' : 'var(--nm-danger-glass-text)';
  return (
    <td style={{ padding: '9px 0', textAlign: 'right', font: `400 12.5px/1 ${mono}`, color }} className="tabular-nums">
      {rate < 0 ? '▽ ' : ''}{fmt(Math.round(rate * 1000) / 10)}%
    </td>
  );
}
