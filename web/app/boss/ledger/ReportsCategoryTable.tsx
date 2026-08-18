import type { IncomeStatement, KindAmount } from '@/lib/ledger-report-summary';
import { fmt } from './ledger-page-helpers';

// 22c 主表——按類別維度(＝傳統的損益表)。見 17-reports-center.md §5、
// 損益表升級(比較期+結構%,A 批範圍定案時談的第 1 層)。
// 每個可下鑽的類別列都可以點開就地抽屜(見 ReportsView 的 drill 處理)。
//
// 沒有上期可比時,「上期」「增減」顯示 —,不顯示 0% 或 +100%(九種狀態之一)——
// prevStmt 為 null 就是這個狀態,由呼叫端(ReportsView)判斷是否有上期資料可比。
export function ReportsCategoryTable({ stmt, prevStmt, drillHref }: {
  stmt: IncomeStatement;
  prevStmt: IncomeStatement | null;
  drillHref: (kind: string) => string;
}) {
  const revenueBase = stmt.operatingIncomeTotal;
  const prevByKind = new Map<string, number>();
  if (prevStmt) {
    for (const r of [...prevStmt.operatingIncomeRows, ...prevStmt.operatingExpenseRows]) prevByKind.set(r.kind, r.amount);
  }

  return (
    <table data-report-table="category" style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={rowHeadStyle}>
          <th style={{ ...thStyle, textAlign: 'left' }}>項目</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>本期</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>上期</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>增減</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>佔營收</th>
        </tr>
      </thead>
      <tbody>
        <SectionRows rows={stmt.operatingIncomeRows} sign={1} drillHref={drillHref} prevByKind={prevByKind} hasPrior={!!prevStmt} revenueBase={revenueBase} />
        <TotalRow label="─ 營業收入" value={stmt.operatingIncomeTotal} prevValue={prevStmt?.operatingIncomeTotal ?? null} revenueBase={revenueBase} isSubtotal />

        <SectionRows rows={stmt.operatingExpenseRows} sign={-1} drillHref={drillHref} prevByKind={prevByKind} hasPrior={!!prevStmt} revenueBase={revenueBase} />
        <TotalRow label="轉帳手續費" value={-stmt.feeTotal} prevValue={prevStmt ? -prevStmt.feeTotal : null} revenueBase={revenueBase} />
        <TotalRow label="─ 營業費用" value={-(stmt.operatingExpenseTotal + stmt.feeTotal)} prevValue={prevStmt ? -(prevStmt.operatingExpenseTotal + prevStmt.feeTotal) : null} revenueBase={revenueBase} isSubtotal />

        <TotalRow label="營業損益" value={stmt.operatingNet} prevValue={prevStmt?.operatingNet ?? null} revenueBase={revenueBase} isGrandTotal tone="operating" verdict />

        {(stmt.nonOperatingIncomeRows.length > 0 || stmt.nonOperatingExpenseRows.length > 0) && (
          <>
            <tr><td colSpan={5} style={{ padding: '10px 0 4px', fontSize: 11, color: 'var(--nm-text-muted)' }}>營業外及個人項——借款/資本、投資、健檢,不計入營業損益</td></tr>
            <SectionRows rows={stmt.nonOperatingIncomeRows} sign={1} drillHref={drillHref} prevByKind={prevByKind} hasPrior={!!prevStmt} revenueBase={revenueBase} />
            <SectionRows rows={stmt.nonOperatingExpenseRows} sign={-1} drillHref={drillHref} prevByKind={prevByKind} hasPrior={!!prevStmt} revenueBase={revenueBase} />
          </>
        )}

        {stmt.retiredRows.length > 0 && (
          <SectionRows rows={stmt.retiredRows} sign={-1} drillHref={drillHref} prevByKind={prevByKind} hasPrior={!!prevStmt} revenueBase={revenueBase} retired />
        )}

        <TotalRow label="本期淨額" value={stmt.net} prevValue={prevStmt?.net ?? null} revenueBase={revenueBase} isGrandTotal tone="net" verdict />
      </tbody>
    </table>
  );
}

const rowHeadStyle: React.CSSProperties = { borderBottom: '1px solid rgba(255,255,255,.16)' };
const thStyle: React.CSSProperties = {
  padding: '8px 0', font: '400 10px/1 inherit', letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--nm-text-muted)',
};
const mono = 'var(--font-geist-mono),monospace';

function SectionRows({ rows, sign, drillHref, prevByKind, hasPrior, revenueBase, retired }: {
  rows: KindAmount[];
  sign: 1 | -1;
  drillHref: (kind: string) => string;
  prevByKind: Map<string, number>;
  hasPrior: boolean;
  revenueBase: number;
  retired?: boolean;
}) {
  return (
    <>
      {rows.map((r) => {
        const value = sign * r.amount;
        const prevRaw = prevByKind.get(r.kind);
        const prevValue = hasPrior && prevRaw !== undefined ? sign * prevRaw : hasPrior ? 0 : null;
        return (
          <tr key={r.kind} style={{ borderBottom: '1px solid var(--nm-border-hair)' }}>
            <td style={{ padding: '9px 0', font: '400 13px/1.4 inherit', color: retired ? 'var(--nm-text-secondary)' : 'var(--nm-text-body)' }} data-drill>
              <a href={drillHref(r.kind)} style={{ color: 'inherit', textDecoration: 'none' }}>
                {r.label}
                {retired && <span style={{ font: '400 11px/1 inherit', color: 'var(--nm-text-muted)', marginLeft: 6 }}>歷史資料,不可新增</span>}
              </a>
            </td>
            <NumTd value={value} />
            <PrevTd prevValue={prevValue} />
            <DeltaTd value={value} prevValue={prevValue} />
            <PctTd value={r.amount} base={revenueBase} />
          </tr>
        );
      })}
    </>
  );
}

function TotalRow({ label, value, prevValue, revenueBase, isSubtotal, isGrandTotal, tone, verdict }: {
  label: string;
  value: number;
  prevValue: number | null;
  revenueBase: number;
  isSubtotal?: boolean;
  isGrandTotal?: boolean;
  tone?: 'operating' | 'net';
  verdict?: boolean;
}) {
  const background = tone === 'operating' ? 'rgba(126,207,157,.05)' : tone === 'net' ? 'rgba(255,255,255,.03)' : undefined;
  return (
    <tr style={{ borderBottom: isGrandTotal ? undefined : '1px solid rgba(255,255,255,.16)', background }} data-total={tone}>
      <td style={{
        padding: isGrandTotal ? '13px 0 13px 10px' : '10px 0',
        font: isGrandTotal ? '500 14px/1.4 inherit' : isSubtotal ? '500 13px/1.4 inherit' : '400 13px/1.4 inherit',
        color: 'var(--nm-text-primary)',
      }}>{label}</td>
      <td
        style={{
          padding: isGrandTotal ? '13px 10px 13px 0' : '10px 0',
          textAlign: 'right',
          font: isGrandTotal ? `600 19px/1 ${mono}` : `500 13.5px/1 ${mono}`,
        }}
        className="tabular-nums"
        data-headline={isGrandTotal ? true : undefined}
        data-verdict-cell={verdict ? true : undefined}
      >
        <NumberCell value={value} showTriangleWhenNegative={verdict} />
      </td>
      <PrevTd prevValue={prevValue} />
      <DeltaTd value={value} prevValue={prevValue} />
      <PctTd value={Math.abs(value)} base={revenueBase} />
    </tr>
  );
}

function NumTd({ value }: { value: number }) {
  return (
    <td style={{ padding: '9px 0', textAlign: 'right', font: `400 13px/1.4 ${mono}` }} className="tabular-nums">
      <NumberCell value={value} />
    </td>
  );
}

// 「沒有上期可比」是九種狀態之一:顯示 —,不顯示 0% 或 +100%——
// prevValue === null 代表沒有上期資料(不是「上期是 0」,那是另一回事,仍要算增減)。
function PrevTd({ prevValue }: { prevValue: number | null }) {
  return (
    <td style={{ padding: '9px 0', textAlign: 'right', font: `400 12.5px/1.4 ${mono}`, color: 'var(--nm-text-secondary)' }} className="tabular-nums">
      {prevValue === null ? <span style={{ color: 'var(--nm-text-faint)' }}>—</span> : `$${fmt(prevValue)}`}
    </td>
  );
}

function DeltaTd({ value, prevValue }: { value: number; prevValue: number | null }) {
  if (prevValue === null) {
    return <td style={{ padding: '9px 0', textAlign: 'right', font: `400 12.5px/1.4 ${mono}`, color: 'var(--nm-text-faint)' }}>—</td>;
  }
  if (prevValue === 0) {
    return (
      <td style={{ padding: '9px 0', textAlign: 'right', font: `400 12.5px/1.4 ${mono}`, color: 'var(--nm-text-faint)' }}>
        {value === 0 ? '—' : '新增'}
      </td>
    );
  }
  const pct = ((value - prevValue) / Math.abs(prevValue)) * 100;
  const color = pct > 0 ? 'var(--nm-success-glass-text)' : pct < 0 ? 'var(--nm-danger-glass-text)' : 'var(--nm-text-secondary)';
  return (
    <td style={{ padding: '9px 0', textAlign: 'right', font: `400 12.5px/1.4 ${mono}`, color }} className="tabular-nums">
      {pct > 0 ? '+' : ''}{pct.toFixed(0)}%
    </td>
  );
}

function PctTd({ value, base }: { value: number; base: number }) {
  if (base <= 0) return <td style={{ padding: '9px 0', textAlign: 'right', font: `400 12.5px/1.4 ${mono}`, color: 'var(--nm-text-faint)' }}>不計</td>;
  const pct = (Math.abs(value) / base) * 100;
  return (
    <td style={{ padding: '9px 0', textAlign: 'right', font: `400 12.5px/1.4 ${mono}`, color: 'var(--nm-text-muted)' }} className="tabular-nums">
      {pct.toFixed(1)}%
    </td>
  );
}

// 數字著色與「▽」規則(R6):只有判定值(營業損益/本期淨額/毛利)為負才加 ▽,
// 費用明細列本身已經是負號,不重複加——不然整張表滿版▽,真正該注意的那格反而不顯眼。
export function NumberCell({ value, showTriangleWhenNegative }: { value: number; showTriangleWhenNegative?: boolean }) {
  const color = value > 0 ? 'var(--nm-success-glass-text)' : value < 0 ? 'var(--nm-danger-glass-text)' : 'var(--nm-text-secondary)';
  const sign = value > 0 ? '+' : '';
  const triangle = showTriangleWhenNegative && value < 0 ? '▽ ' : '';
  return <span style={{ color }}>{triangle}{sign}${fmt(value)}</span>;
}
