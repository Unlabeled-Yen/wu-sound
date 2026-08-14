import Link from 'next/link';
import type { LedgerInsight } from '@/lib/ledger-insight';

// 用原生 <details> 做展開/收合,不需要為此另開 client component。
// 「重新分析」沒有做成按鈕——這是規則式摘要,每次伺服器渲染本來就是拿當下最新
// 數字重算一次,加一個按按鈕卻什麼都不重算的假動作,比不做還糟。
export function AiInsightCard({ insight }: { insight: LedgerInsight }) {
  return (
    <div className="rounded-2xl nm-raised p-4 flex flex-col" style={{ height: 260 }}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[15px] font-semibold" style={{ color: 'var(--nm-text-primary)' }}>收支分析</div>
        <span className="nm-pill nm-pill-neutral">規則式摘要</span>
      </div>

      <p className="text-[13.5px] mt-2 leading-[2]" style={{ color: 'var(--nm-text-body)' }}>{insight.headline}</p>

      {insight.secondary.length > 0 && (
        <div
          className="text-[12.5px] leading-[1.9] py-2 my-1 flex-1 min-h-0 overflow-y-auto"
          style={{ color: 'var(--nm-text-secondary)', borderTop: '1px solid var(--nm-border-hair)', borderBottom: '1px solid var(--nm-border-hair)' }}
        >
          {insight.secondary.map((s, i) => <p key={i}>{s}</p>)}
        </div>
      )}

      {insight.action && (
        <Link
          href={insight.action.href}
          className="mt-2 rounded-[13px] px-3 py-2.5 text-[13px] flex items-center justify-between gap-2"
          style={{ background: 'rgba(217,181,107,0.08)', border: '1px solid rgba(217,181,107,0.28)', color: 'var(--nm-warning-glass-text)' }}
        >
          <span>{insight.action.label}</span>
        </Link>
      )}

      <p className="text-[11px] mt-2" style={{ color: 'var(--nm-text-faint)' }}>{insight.basisNote}</p>
    </div>
  );
}
