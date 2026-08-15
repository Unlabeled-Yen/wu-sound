'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { LedgerInsight, LedgerInsightTodo } from '@/lib/ledger-insight';

const fmt = (n: number) => Math.round(n).toLocaleString('zh-TW');

// v2:收支分析卡改成三分頁(變化/關聯/待補),取代舊版單卡
// (design_handoff_wu_sound 10/14-cashflow-insight.md、prototypes/18a.html·18b.html)。
// commit 2 只做外殼＋待補分頁——變化/關聯需要新的月比月聚合、跨表關聯查詢,
// 風險較高,留到之後的 commit 再做,這輪先顯示「尚未接上」而不是編資料出來。
//
// 預設分頁選「待補」而不是設計稿原本的「變化」,因為這輪只有待補分頁有真資料;
// 之後變化/關聯做好了,可以把預設換回變化分頁。
type Tab = 'change' | 'link' | 'todo';

export function AiInsightCard({ insight, todo }: { insight: LedgerInsight; todo: LedgerInsightTodo }) {
  const [tab, setTab] = useState<Tab>('todo');
  const todoCount = [todo.residual, todo.missingCustomer, todo.aging && todo.aging.overdue > 0 ? todo.aging : null].filter(Boolean).length;

  return (
    <div className="rounded-2xl nm-raised p-5 flex flex-col h-full min-w-0" data-insight-panel={tab}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="text-[15px] leading-none font-semibold" style={{ color: 'var(--nm-text-primary)' }}>收支分析</div>
        <span className="nm-pill nm-pill-neutral shrink-0">規則式摘要</span>
      </div>
      <div className="text-[11.5px] leading-[1.6] mb-4" style={{ color: 'var(--nm-text-faint)' }}>只講上面各區塊看不出來的事</div>

      <div className="flex gap-1 p-1 rounded-xl mb-5 text-[12px]" style={{ background: 'rgba(8,8,10,.5)', border: '1px solid rgba(255,255,255,.12)' }}>
        {(
          [
            { key: 'change' as const, label: '變化' },
            { key: 'link' as const, label: '關聯' },
            { key: 'todo' as const, label: '待補', badge: todoCount },
          ]
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className="flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5"
            style={tab === t.key
              ? { background: 'var(--nm-text-primary)', color: '#17171a', fontWeight: 500 }
              : { color: 'var(--nm-text-secondary)' }}
          >
            {t.label}
            {!!t.badge && t.badge > 0 && (
              <span
                className="inline-flex items-center justify-center tabular-nums"
                style={{ minWidth: 16, height: 16, borderRadius: 999, background: 'var(--nm-warning)', color: '#17171a', fontSize: 9.5, fontWeight: 700, lineHeight: '16px' }}
              >
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        {tab === 'change' && <NotWiredPanel text="這裡會顯示近六個月月比月的收支變化,需要新的月度聚合查詢,尚未接上。" />}
        {tab === 'link' && <NotWiredPanel text="這裡會顯示帳務與現金水位之間的關聯(例如哪個案子的付款早於收款),需要跨表關聯查詢,尚未接上。" />}
        {tab === 'todo' && <TodoPanel todo={todo} />}
      </div>

      <div className="flex-1" />

      {insight.action && (
        <Link
          href={insight.action.href}
          className="flex items-center gap-3 rounded-[13px] px-4 py-3.5 text-[13px] leading-[1.6] mb-4"
          style={{ background: 'rgba(217,181,107,0.08)', border: '1px solid rgba(217,181,107,0.28)', color: 'var(--nm-warning-glass-text)' }}
        >
          <span className="flex-1 min-w-0">{insight.action.label}</span>
          <span className="shrink-0 text-[12.5px] leading-none font-medium" style={{ color: 'var(--nm-text-primary)' }}>前往 ›</span>
        </Link>
      )}

      <p className="text-[11px] leading-[1.7]" style={{ color: 'var(--nm-text-faint)' }}>{insight.basisNote}</p>
    </div>
  );
}

function NotWiredPanel({ text }: { text: string }) {
  return (
    <div className="flex-1 flex items-center justify-center text-center px-2">
      <p className="text-[12.5px] leading-[1.8]" style={{ color: 'var(--nm-text-faint)' }}>尚未接上　·　{text}</p>
    </div>
  );
}

function TodoPanel({ todo }: { todo: LedgerInsightTodo }) {
  const cardCount = [todo.residual, todo.missingCustomer, todo.aging].filter(Boolean).length;

  if (cardCount === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-center px-2">
        <p className="text-[12.5px] leading-[1.8]" style={{ color: 'var(--nm-text-faint)' }}>目前沒有待補資料——殘差對得起來,收入都有掛客戶。</p>
      </div>
    );
  }

  return (
    <>
      <div className="text-[11px] leading-none tracking-[.16em] uppercase mb-3.5" style={{ color: 'var(--nm-text-muted)' }}>
        資料本身的問題　{cardCount} 件
      </div>

      <div className="flex flex-col gap-2.5">
        {todo.residual && <ResidualCard residual={todo.residual} />}
        {todo.missingCustomer && <MissingCustomerCard missingCustomer={todo.missingCustomer} />}
        {todo.aging && <AgingCard aging={todo.aging} />}
      </div>
    </>
  );
}

function ResidualCard({ residual }: { residual: NonNullable<LedgerInsightTodo['residual']> }) {
  const { incomeUnsettled, expenseUnsettled } = residual;
  const bar2Pct = incomeUnsettled > 0 ? Math.min(100, (expenseUnsettled / incomeUnsettled) * 100) : 0;
  return (
    <div className="rounded-[14px]" style={{ background: 'rgba(217,181,107,.05)', border: '1px solid rgba(217,181,107,.28)', padding: '14px 15px' }}>
      <div className="flex items-baseline justify-between mb-2.5">
        <span className="text-[12.5px] leading-none" style={{ color: 'var(--nm-warning-glass-text)' }}>對不起來</span>
        <span className="tabular-nums text-[14px] leading-none font-semibold" style={{ color: 'var(--nm-warning-glass-text)' }}>${fmt(residual.amountTwd)}</span>
      </div>
      <div className="flex items-center gap-0 mb-2.5" style={{ height: 22 }}>
        <span className="flex-1 block" style={{ height: 10, border: '1.5px solid var(--nm-warning)', background: 'rgba(217,181,107,.14)', borderRadius: 2 }} />
        <span className="flex-none text-center text-[11px] leading-none" style={{ width: 22, color: 'var(--nm-text-secondary)' }}>−</span>
        <span className="flex-none block" style={{ width: `${bar2Pct}%`, height: 10, border: '1.5px solid var(--nm-danger)', background: 'rgba(224,122,122,.14)', borderRadius: 2 }} />
        <span className="flex-none text-center text-[11px] leading-none" style={{ width: 22, color: 'var(--nm-text-secondary)' }}>≠</span>
        <span className="flex-none block" style={{ width: 14, height: 10, border: '1.5px solid rgba(255,255,255,.42)', background: 'rgba(255,255,255,.06)', borderRadius: 2 }} />
      </div>
      <div className="text-[11px] leading-[1.6]" style={{ color: '#9c9293' }}>
        應收款 − 應付款 ＝ ${fmt(residual.incomeUnsettled - residual.expenseUnsettled)},未實現淨額卻不同。可能是部分收款或作廢單被算進其中一邊。
      </div>
    </div>
  );
}

function MissingCustomerCard({ missingCustomer }: { missingCustomer: NonNullable<LedgerInsightTodo['missingCustomer']> }) {
  return (
    <div className="rounded-[14px]" style={{ background: 'rgba(217,181,107,.05)', border: '1px solid rgba(217,181,107,.28)', padding: '14px 15px' }}>
      <div className="flex items-baseline justify-between mb-2.5">
        <span className="text-[12.5px] leading-none" style={{ color: 'var(--nm-warning-glass-text)' }}>缺客戶名</span>
        <span className="tabular-nums text-[14px] leading-none font-semibold" style={{ color: 'var(--nm-warning-glass-text)' }}>1 筆</span>
      </div>
      <div className="flex items-center gap-2.5 mb-2.5">
        <span className="flex-none rounded" style={{ padding: '3px 9px', border: '1.5px dashed rgba(217,181,107,.6)', fontSize: 13, fontWeight: 500, color: 'var(--nm-warning-glass-text)' }}>?</span>
        <span className="flex-1 block rounded" style={{ height: 8, background: 'rgba(126,207,157,.5)' }} />
        <span className="tabular-nums text-[11.5px] font-medium" style={{ color: 'var(--nm-success-glass-text)' }}>${fmt(missingCustomer.amountTwd)}</span>
      </div>
      <div className="text-[11px] leading-[1.6]" style={{ color: '#9c9293' }}>本期最大一筆收入沒有掛客戶,所以「收入主要來自誰」算不出名字。</div>
    </div>
  );
}

function AgingCard({ aging }: { aging: NonNullable<LedgerInsightTodo['aging']> }) {
  const total = aging.notDue + aging.within30 + aging.overdue;
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className="rounded-[14px]" style={{ background: 'rgba(8,8,10,.4)', border: '1px solid rgba(255,255,255,.11)', padding: '14px 15px' }}>
      <div className="flex items-baseline justify-between mb-2.5">
        <span className="text-[12.5px] leading-none" style={{ color: 'var(--nm-text-body)' }}>未結約定</span>
        <span className="tabular-nums text-[14px] leading-none font-semibold" style={{ color: 'var(--nm-text-primary)' }}>{total} 筆</span>
      </div>
      <div className="flex gap-[3px] mb-2.5" style={{ height: 20 }}>
        {aging.notDue > 0 && <span className="block rounded-sm" style={{ width: pct(aging.notDue), background: 'rgba(126,207,157,.3)' }} />}
        {aging.within30 > 0 && <span className="block rounded-sm" style={{ width: pct(aging.within30), background: 'rgba(217,181,107,.3)' }} />}
        {aging.overdue > 0 && <span className="block rounded-sm" style={{ width: pct(aging.overdue), border: '1.5px solid var(--nm-danger)', background: 'rgba(224,122,122,.16)' }} />}
      </div>
      <div className="flex justify-between tabular-nums text-[10px] mb-2" style={{ color: 'var(--nm-text-muted)' }}>
        <span>未到期 {aging.notDue}</span>
        <span>30 天內 {aging.within30}</span>
        <span style={{ color: aging.overdue > 0 ? 'var(--nm-danger-glass-text)' : undefined }}>已逾期 {aging.overdue}</span>
      </div>
      <div className="text-[11px] leading-[1.6]" style={{ color: '#9c9293' }}>帳齡分佈——淨額帶只講金額,這裡講時間。</div>
    </div>
  );
}
