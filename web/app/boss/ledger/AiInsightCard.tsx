'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { LedgerInsight, LedgerInsightTodo, LedgerInsightChange, LedgerInsightLinkCase } from '@/lib/ledger-insight';

const fmt = (n: number) => Math.round(n).toLocaleString('zh-TW');

// v2:收支分析卡改成三分頁(變化/關聯/待補),取代舊版單卡
// (design_handoff_wu_sound 10/14-cashflow-insight.md、prototypes/18a.html·18b.html)。
type Tab = 'change' | 'link' | 'todo';

export function AiInsightCard({
  insight, todo, change, link,
}: {
  insight: LedgerInsight;
  todo: LedgerInsightTodo;
  change: LedgerInsightChange;
  link: LedgerInsightLinkCase | null;
}) {
  const [tab, setTab] = useState<Tab>('change');
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
        {tab === 'change' && <ChangePanel change={change} />}
        {tab === 'link' && <LinkPanel link={link} />}
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

function EmptyPanel({ text }: { text: string }) {
  return (
    <div className="flex-1 flex items-center justify-center text-center px-2">
      <p className="text-[12.5px] leading-[1.8]" style={{ color: 'var(--nm-text-faint)' }}>{text}</p>
    </div>
  );
}

const MONTH_LABEL = (m: string) => m.slice(5, 7);

function ChangePanel({ change }: { change: LedgerInsightChange }) {
  if (change.months.length === 0) return <EmptyPanel text="沒有分錄可算近六個月變化。" />;

  const maxPositive = Math.max(1, ...change.months.map((m) => Math.max(0, m.net)));
  const latestMonth = change.months[change.months.length - 1]?.month;

  const rows: Array<{ badge: string; badgeColor: string; text: ReactNode }> = [];
  if (change.mom) {
    const { latestIsHighest, diffTwd, pct } = change.mom;
    const sign = diffTwd >= 0 ? '＋' : '−';
    rows.push({
      badge: pct !== null ? `${sign}${Math.abs(pct).toFixed(0)}%` : `${sign}$${fmt(Math.abs(diffTwd))}`,
      badgeColor: diffTwd >= 0 ? 'var(--nm-success-glass-text)' : 'var(--nm-danger-glass-text)',
      text: (
        <>
          {latestIsHighest ? '本月實收淨額是六個月最高，' : '本月實收淨額'}
          較上月{diffTwd >= 0 ? '多' : '少'} <span style={{ fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace' }}>${fmt(Math.abs(diffTwd))}</span>
        </>
      ),
    });
  }
  if (change.collectionDays) {
    const { currentAvgDays, diffDays } = change.collectionDays;
    rows.push({
      badge: `${currentAvgDays} 天`,
      badgeColor: 'var(--nm-text-body)',
      text: diffDays !== null
        ? `本月平均收款天數，比上月${diffDays >= 0 ? '多' : '少'} ${Math.abs(diffDays)} 天`
        : '本月平均收款天數(還沒有上月樣本可比)',
    });
  }

  return (
    <>
      <div className="text-[11px] leading-none tracking-[.16em] uppercase mb-3.5" style={{ color: 'var(--nm-text-muted)' }}>
        實收淨額　近{change.months.length}個月
      </div>

      <div className="flex items-end gap-1.5 mb-2.5" style={{ height: 96 }}>
        {change.months.map((m) => {
          const isLatest = m.month === latestMonth;
          const h = m.net > 0 ? Math.max(2, (m.net / maxPositive) * 100) : 0;
          return (
            <div key={m.month} className="flex-1 flex flex-col justify-end" style={{ height: '100%' }}>
              <span className="block rounded-sm" style={{ height: `${h}%`, background: isLatest ? 'rgba(126,207,157,.6)' : 'rgba(126,207,157,.28)' }} />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1.5 mb-4 tabular-nums text-[10px]" style={{ color: 'var(--nm-text-faint)' }}>
        {change.months.map((m) => (
          <span key={m.month} className="flex-1 text-center" style={{ color: m.month === latestMonth ? 'var(--nm-success-glass-text)' : undefined }}>
            {MONTH_LABEL(m.month)}
          </span>
        ))}
      </div>

      {rows.length === 0 && <EmptyPanel text="這六個月的樣本還不夠算出比較。" />}
      {rows.length > 0 && (
        <div className="flex flex-col">
          {rows.map((r, i) => (
            <div key={i} className="flex items-baseline gap-2.5" style={{ padding: '12px 0', borderTop: '1px solid rgba(255,255,255,.09)', borderBottom: i === rows.length - 1 ? '1px solid rgba(255,255,255,.09)' : undefined }}>
              <span className="flex-none tabular-nums font-semibold text-[15px]" style={{ width: 58, color: r.badgeColor }}>{r.badge}</span>
              <span className="flex-1 text-[12.5px] leading-[1.6]" style={{ color: 'var(--nm-text-body)' }}>{r.text}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function LinkPanel({ link }: { link: LedgerInsightLinkCase | null }) {
  if (!link) return <EmptyPanel text="目前沒有同一個案子「錢先出後進」的情形可看。" />;

  return (
    <>
      <div className="text-[11px] leading-none tracking-[.16em] uppercase mb-1.5" style={{ color: 'var(--nm-text-muted)' }}>
        同一個案子，錢先出後進
      </div>
      <div className="text-[11.5px] leading-[1.6] mb-4" style={{ color: 'var(--nm-text-secondary)' }}>{link.siteLabel}</div>

      <div className="flex flex-col gap-2.5 mb-4">
        <div className="rounded-[10px] flex items-center justify-between" style={{ padding: '10px 12px', border: '1.5px solid var(--nm-danger)', background: 'rgba(224,122,122,.1)' }}>
          <span className="text-[11.5px]" style={{ color: 'var(--nm-danger-glass-text)' }}>應付到期　{link.payableDueDate}</span>
          <span className="tabular-nums text-[13px] font-medium" style={{ color: 'var(--nm-danger-glass-text)' }}>${fmt(link.payableAmount)}</span>
        </div>
        <div className="text-center text-[11px]" style={{ color: 'var(--nm-warning-glass-text)' }}>缺口 {link.gapDays} 天</div>
        <div className="rounded-[10px] flex items-center justify-between" style={{ padding: '10px 12px', border: '1.5px dashed var(--nm-warning)', background: 'rgba(217,181,107,.1)' }}>
          <span className="text-[11.5px]" style={{ color: 'var(--nm-warning-glass-text)' }}>應收約定　{link.receivableDueDate}</span>
          <span className="tabular-nums text-[13px] font-medium" style={{ color: 'var(--nm-warning-glass-text)' }}>${fmt(link.receivableAmount)}</span>
        </div>
      </div>

      <div className="text-[12.5px] leading-[1.6] mb-4" style={{ color: 'var(--nm-text-body)' }}>
        這個案子的應付到期日比應收約定收款日早 <span className="tabular-nums" style={{ color: 'var(--nm-warning-glass-text)' }}>{link.gapDays} 天</span>,要先付出去才收得到。
      </div>

      <Link
        href={`/boss/ledger?site_id=${link.siteId}`}
        className="flex items-center justify-between rounded-[13px] px-4 py-3.5 text-[13px]"
        style={{ background: 'var(--nm-text-primary)', color: '#17171a' }}
      >
        <span>看{link.siteLabel}</span><span>›</span>
      </Link>
    </>
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
