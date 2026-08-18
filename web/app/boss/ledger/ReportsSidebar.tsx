import { fmt } from './ledger-page-helpers';

// 22c 側欄三塊。見 17-reports-center.md §6。
export function ReportsSidebar({
  settledIncome, settledExpense, unsettledIncome, unsettledExpense,
  humanCostNote, exportDisabledReason,
}: {
  settledIncome: number;
  settledExpense: number;
  unsettledIncome: number;
  unsettledExpense: number;
  humanCostNote: string;
  exportDisabledReason: string | null;
}) {
  const block: React.CSSProperties = { borderRadius: 13, background: 'rgba(8,8,10,.4)', border: '1px solid rgba(255,255,255,.11)', padding: '14px 15px' };
  const title: React.CSSProperties = { font: '400 10.5px/1 inherit', letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--nm-text-muted)', marginBottom: 12 };
  const mono = 'var(--font-geist-mono),monospace';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={block}>
        <div style={title}>已收付　vs　未收付</div>
        <SidebarRow label="已收(本期)" value={settledIncome} valueColor="var(--nm-success-glass-text)" strong mono={mono} />
        <SidebarRow label="應收未收(在手)" value={unsettledIncome} valueColor="var(--nm-warning-glass-text)" mono={mono} />
        <SidebarRow label="已付(本期)" value={-settledExpense} valueColor="var(--nm-danger-glass-text)" strong mono={mono} />
        <SidebarRow label="應付未付(在手)" value={-unsettledExpense} valueColor="var(--nm-danger-glass-text)" mono={mono} />
        <div style={{ marginTop: 8, font: '400 11.5px/1.5 inherit', color: 'var(--nm-warning-glass-text)' }}>
          不提供「已收＋未收」的合計。合併會把同一筆錢算兩遍。
        </div>
      </div>

      <div style={{ ...block, background: 'rgba(217,181,107,.06)', border: '1px solid rgba(217,181,107,.28)' }}>
        <div style={title}>這份報表沒有算什麼</div>
        <div style={{ font: '400 12.5px/1.6 inherit', color: 'var(--nm-text-secondary)' }}>{humanCostNote}</div>
      </div>

      <div style={block}>
        <div style={title}>匯出</div>
        <div style={{ font: '400 12px/1.6 inherit', color: 'var(--nm-text-secondary)' }}>
          紙張比例的預覽會抽掉旋鈕、下鑽連結與這個說明框,補上公司抬頭、期間、列印時間與頁碼。
        </div>
        {exportDisabledReason && (
          <div style={{ marginTop: 8, font: '400 11.5px/1.5 inherit', color: 'var(--nm-danger-glass-text)' }}>
            {exportDisabledReason}——匯出已停用。
          </div>
        )}
      </div>
    </div>
  );
}

function SidebarRow({ label, value, valueColor, strong, mono }: { label: string; value: number; valueColor: string; strong?: boolean; mono: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '4px 0' }}>
      <span style={{ font: strong ? '500 12.5px/1 inherit' : '400 12.5px/1 inherit', color: strong ? 'var(--nm-text-body)' : 'var(--nm-text-secondary)' }}>{label}</span>
      <span style={{ font: `${strong ? 500 : 400} ${strong ? 13.5 : 13}px/1 ${mono}`, color: valueColor }} className="tabular-nums">
        {value >= 0 ? '' : '−'}${fmt(Math.abs(value))}
      </span>
    </div>
  );
}
