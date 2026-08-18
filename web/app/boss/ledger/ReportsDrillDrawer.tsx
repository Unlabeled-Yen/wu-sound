import { fmt } from './ledger-page-helpers';

// 就地抽屜(Q5):看數字不離開,要動手才離開。伺服器端 Link 狀態(?drill=),
// 不是 client component——跟這個資料夾其餘的分頁/篩選連結同一套模式。
export interface DrillRow {
  occurred_on: string;
  party: string | null;
  siteName: string | null;
  amount_twd: number;
}

export function ReportsDrillDrawer({
  title, count, total, rows, seeAllHref, collapseHref,
}: {
  title: string;
  count: number;
  total: number;
  rows: DrillRow[];
  seeAllHref: string;
  collapseHref: string;
}) {
  const mono = 'var(--font-geist-mono),monospace';
  return (
    <div className="no-print" data-drawer style={{ borderTop: '1px solid var(--nm-border-hair)', background: 'rgba(8,8,10,.34)', padding: '16px 28px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ font: '400 11px/1 inherit', color: 'var(--nm-text-muted)' }}>
          就地抽屜　·　{title}　·　{count} 筆　·　合計 ${fmt(total)}
        </div>
        <a href={collapseHref} style={{ font: '400 12px/1 inherit', color: 'var(--nm-text-secondary)', textDecoration: 'none' }}>收起 ▴</a>
      </div>

      {count === 0 ? (
        <div style={{ padding: '10px 0', font: '400 13px/1.4 inherit', color: 'var(--nm-text-faint)' }}>這個項目在這段期間沒有明細</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, font: '400 12.5px/1.4 inherit', color: 'var(--nm-text-body)' }}>
              <span style={{ width: 74, fontFamily: mono, color: 'var(--nm-text-muted)' }} className="tabular-nums">{r.occurred_on}</span>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.party || '(未填對象)'}</span>
              <span style={{ width: 240, color: r.siteName ? 'var(--nm-text-secondary)' : 'var(--nm-warning-glass-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.siteName ?? '未掛案子'}
              </span>
              <span style={{ width: 120, textAlign: 'right', fontFamily: mono }} className="tabular-nums">${fmt(r.amount_twd)}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
        <a href={seeAllHref} className="nm-btn" style={{ minHeight: 34, borderRadius: 10, padding: '6px 14px', fontSize: 12.5 }}>到明細頁看全部 {count} 筆</a>
        <span style={{ font: '400 11px/1.4 inherit', color: 'var(--nm-text-faint)' }}>前三筆就地看完就走　·　帶著期間與類別的篩選條件過去</span>
      </div>
    </div>
  );
}
