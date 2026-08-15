import { LEDGER_KIND_LABEL, type LedgerEntry } from '@/lib/types';

const fmt = (n: number) => n.toLocaleString('zh-TW');

// v2:桌機列表固定高度(監測帶要常駐,列表不能把它推出視野),內部捲動;
// 手機維持頁面捲動——小螢幕固定高度會讓可視列數過少,規格 §6 的建議。
const LIST_HEIGHT = 480;

export type SettledEntry = LedgerEntry & { sites?: { name: string } | null };

// 本月已收付明細(單一方向,收入或支出各自一份)。每列在金額下方加一條 2px 佔比條,
// 寬度＝該列金額 ÷ 本欄本月合計——「方案 A:每列佔比條」,回答「這幾筆裡誰佔比較重」,
// 不是拿來跨欄比較(比例以本欄自身 100% 計,見欄首說明)。
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
    <div className="flex flex-col gap-2 min-w-0">
      <div className="flex items-baseline justify-between">
        <div className="text-[15px] font-semibold" style={{ color: 'var(--nm-text-primary)' }}>{title}</div>
        <div className="text-[11px]" style={{ color: 'var(--nm-text-faint)' }}>{items.length} 筆 · 佔比以本欄自身 100% 計</div>
      </div>

      {items.length === 0 && (
        <div className="rounded-2xl nm-raised flex items-center justify-center" style={{ height: 120 }}>
          <p className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>本月沒有已{settledLabel.slice(1)}紀錄</p>
        </div>
      )}

      {items.length > 0 && (
        <>
          {/* 桌機:固定高度＋內部捲動,列表不會把上面的監測帶推出視野。 */}
          <div className="hidden lg:block app-scroll overflow-y-auto pr-1" style={{ height: LIST_HEIGHT }}>
            {items.map((r) => {
              const voided = r.state === 'voided';
              const pct = columnTotal > 0 && !voided ? Math.min(100, (r.amount_twd / columnTotal) * 100) : 0;
              const meta = [settledLabel, r.is_external ? '外帳' : '內帳', r.to_check ? 'AI 待確認' : null, r.occurred_on].filter(Boolean).join(' · ');
              return (
                <div key={r.id} className="py-[14px]" style={{ borderBottom: '1px solid var(--nm-border-hair)', opacity: voided ? 0.5 : 1 }}>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-medium truncate" style={{ color: 'var(--nm-text-body)' }}>{LEDGER_KIND_LABEL[r.kind]}{r.party ? `　${r.party}` : ''}</div>
                      <div className="text-xs mt-1" style={{ color: 'var(--nm-text-muted)' }}>{meta}</div>
                    </div>
                    <span className={`text-[15px] font-semibold tabular-nums shrink-0 ${voided ? 'line-through' : ''}`} style={{ color: textColor }}>${fmt(r.amount_twd)}</span>
                  </div>
                  <div className="mt-2 h-[2px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,.06)' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: barColor, opacity: 0.7 }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* 手機:頁面捲動,不設固定高度。 */}
          <div className="lg:hidden flex flex-col gap-2">
            {items.map((r) => {
              const voided = r.state === 'voided';
              const pct = columnTotal > 0 && !voided ? Math.min(100, (r.amount_twd / columnTotal) * 100) : 0;
              return (
                <div key={r.id} className="nm-raised rounded-2xl p-3.5" style={{ opacity: voided ? 0.5 : 1 }}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[14px] font-medium truncate" style={{ color: 'var(--nm-text-body)' }}>{LEDGER_KIND_LABEL[r.kind]}{r.party ? `　${r.party}` : ''}</span>
                    <span className={`text-[15px] font-semibold tabular-nums ${voided ? 'line-through' : ''}`} style={{ color: textColor }}>${fmt(r.amount_twd)}</span>
                  </div>
                  <div className="text-xs mt-1" style={{ color: 'var(--nm-text-muted)' }}>{r.occurred_on}{r.is_external ? '　·　外帳' : '　·　內帳'}</div>
                  <div className="mt-2 h-[2px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,.08)' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: barColor, opacity: 0.7 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
