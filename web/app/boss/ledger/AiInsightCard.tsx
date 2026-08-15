import Link from 'next/link';
import type { LedgerInsight } from '@/lib/ledger-insight';

// 視覺依 design_handoff_wu_sound/prototypes/7a.html 的「AI 收支分析」區塊逐值照抄
// (padding 20px、標題列 mb-20px、內文 13.5px/2、次要說明區塊上下 hairline 分隔、
// 待辦動作黃色玻璃列、依據說明 11px)。卡片本身高度改用 h-full,在 grid 裡跟左側
// 「未來四週現金」的高度自然對齊(CSS grid 預設 align-items: stretch)。
//
// 「重新分析」連結故意不做——規則式摘要每次伺服器渲染本來就是拿當下最新數字重算
// 一次,加一顆什麼都不重算的假按鈕比不做還糟(見 09-帳務首頁校正與缺口.md §1)。
export function AiInsightCard({ insight }: { insight: LedgerInsight }) {
  return (
    <div className="rounded-2xl nm-raised p-5 flex flex-col h-full">
      <div className="flex items-center justify-between gap-2 mb-5">
        <div className="text-[15px] leading-none font-semibold" style={{ color: 'var(--nm-text-primary)' }}>收支分析</div>
        <span className="nm-pill nm-pill-neutral">規則式摘要</span>
      </div>

      <p className="text-[13.5px] leading-[2] mb-5" style={{ color: 'var(--nm-text-body)' }}>{insight.headline}</p>

      {insight.secondary.length > 0 && (
        <div
          className="py-4 mb-[18px] text-[12.5px] leading-[1.9] space-y-1"
          style={{ color: 'var(--nm-text-secondary)', borderTop: '1px solid var(--nm-border-hair)', borderBottom: '1px solid var(--nm-border-hair)' }}
        >
          {insight.secondary.map((s, i) => <p key={i}>{s}</p>)}
        </div>
      )}

      <div className="flex-1" />

      {insight.action && (
        <Link
          href={insight.action.href}
          className="flex items-center gap-3 rounded-[13px] px-4 py-3.5 text-[13px] leading-[1.6] mb-4"
          style={{ background: 'rgba(217,181,107,0.08)', border: '1px solid rgba(217,181,107,0.28)', color: 'var(--nm-warning-glass-text)' }}
        >
          <span className="flex-1">{insight.action.label}</span>
          <span className="text-[12.5px] leading-none font-medium" style={{ color: 'var(--nm-text-primary)' }}>前往 ›</span>
        </Link>
      )}

      <p className="text-[11px] leading-[1.7]" style={{ color: 'var(--nm-text-faint)' }}>{insight.basisNote}</p>
    </div>
  );
}
