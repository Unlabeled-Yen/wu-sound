'use client';

// 追蹤中清單(05-tender-watch.md §5)。設計稿原本六欄(倒數/案名+機關/預算/
// 領標家數/預測主要對手/勝率)——這裡實作到 6 欄,但把設計圖裡缺資料的
// 「勝率」跟「主要對手」換成 tender-radar 現有資料能撐起來的欄位:
//   倒數 · 案名+機關 · 公告類型 · 性質 · 預算 · 機關競爭度
// 「勝率」需要 Wu 自己過去投標中標紀錄(未接入);「主要對手」需要按機關
// +類別做對手歷史比對(未接入),都不做假欄位。
// 純快速一覽,完整內容還是下方既有的 TenderCard——點一列用錨點捲過去,
// 不重複造一套詳情。

import { useState } from 'react';
import { daysLeft, formatCountdown, type TenderHit, type AgencyCompetition } from './shared';

interface Props {
  hits: TenderHit[];
}

type SortKey = 'deadline' | 'budget';

function barColor(left: number | null): string {
  if (left === null) return 'rgba(255,255,255,0.14)';
  if (left <= 7) return 'var(--nm-breach)';
  if (left <= 14) return 'var(--nm-warning)';
  return 'rgba(255,255,255,0.14)';
}

// 機關競爭度 -> 一個文字標籤 + 顏色。tier=none/thin 樣本太少不給比率(避免誤導),
// tier=range/stable 才用 solo_rate 分級:高獨家率=好搶(黃色,值得看),低獨家率=競爭激烈(灰)。
function competitionLabel(comp: AgencyCompetition | null | undefined): { text: string; color: string } {
  if (!comp || comp.tier === 'none') return { text: '無紀錄', color: 'var(--nm-text-faint)' };
  if (comp.tier === 'thin') return { text: `${comp.n} 案樣本少`, color: 'var(--nm-text-muted)' };
  const rate = comp.soloRate;
  if (rate === null) return { text: `${comp.n} 案`, color: 'var(--nm-text-muted)' };
  const pct = Math.round(rate * 100);
  if (pct >= 60) return { text: `${pct}% 獨家`, color: 'var(--nm-warning-glass-text)' };
  if (pct >= 30) return { text: `${pct}% 獨家`, color: 'var(--nm-text-secondary)' };
  return { text: `${pct}% 獨家`, color: 'var(--nm-text-muted)' };
}

// 公告類型很長(如「公開取得報價單或企劃書公告」),清單裡壓成短標
function shortNoticeType(nt: string): string {
  if (nt.includes('公開取得')) return '公開取得';
  if (nt.includes('公開招標')) return '公開招標';
  if (nt.includes('限制性')) return '限制性';
  if (nt.includes('選擇性')) return '選擇性';
  return nt.length > 6 ? nt.slice(0, 6) : nt;
}

export default function TrackedList({ hits }: Props) {
  const [sort, setSort] = useState<SortKey>('deadline');

  // 排序純前端做(清單就在同一頁面內,不用查詢參數翻頁),只提供設計稿裡
  // 真的有資料支撐的兩種排序——不做「依勝率」。budget 為 null/不公開的案子
  // 排到最後,不是排到最前面假裝是 0 元。
  const sorted = [...hits].sort((a, b) => {
    if (sort === 'deadline') {
      return (daysLeft(a) ?? Infinity) - (daysLeft(b) ?? Infinity);
    }
    const av = a.budget_status === 'value' ? a.budget ?? -Infinity : -Infinity;
    const bv = b.budget_status === 'value' ? b.budget ?? -Infinity : -Infinity;
    return bv - av;
  });

  return (
    <div className="rounded-2xl nm-raised overflow-hidden">
      <div className="flex items-center gap-1 p-2" style={{ borderBottom: '1px solid var(--nm-border-hair)' }}>
        <span className="mr-1 text-[11px] leading-none tracking-[.14em]" style={{ color: 'var(--nm-text-muted)' }}>排序</span>
        {([
          { key: 'deadline' as const, label: '依截止' },
          { key: 'budget' as const, label: '依金額' },
        ]).map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => setSort(o.key)}
            className={sort === o.key ? 'nm-btn-solid' : 'nm-btn'}
            style={{ padding: '4px 12px', minHeight: 'auto', fontSize: '12px' }}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]" style={{ minWidth: 720, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: 'var(--nm-text-muted)', background: 'rgba(20,20,24,0.6)' }}>
              <th className="py-2 px-3 text-left text-[11px] leading-none tracking-[.14em] font-normal" style={{ width: 88 }}>倒數</th>
              <th className="py-2 px-3 text-left text-[11px] leading-none tracking-[.14em] font-normal">案名 · 機關</th>
              <th className="py-2 px-3 text-left text-[11px] leading-none tracking-[.14em] font-normal" style={{ width: 76 }}>類型</th>
              <th className="py-2 px-3 text-left text-[11px] leading-none tracking-[.14em] font-normal" style={{ width: 76 }}>性質</th>
              <th className="py-2 px-3 text-right text-[11px] leading-none tracking-[.14em] font-normal" style={{ width: 100 }}>預算</th>
              <th className="py-2 px-3 text-right text-[11px] leading-none tracking-[.14em] font-normal" style={{ width: 108 }}>機關競爭</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((h) => {
              const left = daysLeft(h);
              const countdown = formatCountdown(h);
              const comp = competitionLabel(h.agency_competition);
              return (
                <tr key={h.id} style={{ borderTop: '1px solid var(--nm-border-hair)' }}>
                  <td className="py-2 px-3" style={{ borderLeft: `2px solid ${barColor(left)}` }}>
                    <a href={`#tender-${h.id}`} className="tabular-nums font-semibold" style={{ color: left !== null && left <= 7 ? 'var(--nm-breach)' : 'var(--nm-text-secondary)' }}>
                      {countdown ?? '—'}
                    </a>
                  </td>
                  <td className="py-2 px-3">
                    <a href={`#tender-${h.id}`} className="hover:underline" style={{ color: 'var(--nm-text-body)' }}>
                      {h.title}
                      {h.notice_type.includes('更正') && (
                        <span
                          className="ml-1 text-[10px] px-1 py-px rounded"
                          style={{ color: 'var(--nm-warning-glass-text)', background: 'rgba(217,181,107,0.12)', border: '1px solid rgba(217,181,107,0.26)' }}
                        >
                          有更正公告
                        </span>
                      )}
                      <span className="ml-1.5 text-[11px] leading-none tracking-[.14em]" style={{ color: 'var(--nm-text-muted)' }}>
                        {h.unit_name || h.unit_id || '未知機關'}
                      </span>
                    </a>
                  </td>
                  <td className="py-2 px-3 text-[12px]" style={{ color: 'var(--nm-text-secondary)' }}>
                    {shortNoticeType(h.notice_type)}
                  </td>
                  <td className="py-2 px-3 text-[12px]" style={{ color: 'var(--nm-text-secondary)' }}>
                    {h.nature?.label ?? '—'}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums" style={{ color: 'var(--nm-text-secondary)' }}>
                    {h.budget_status === 'value' && h.budget !== null
                      ? `$${(h.budget / 100 / 10000).toLocaleString('zh-TW', { maximumFractionDigits: 0 })} 萬`
                      : '—'}
                  </td>
                  <td className="py-2 px-3 text-right text-[12px]" style={{ color: comp.color }}>
                    {comp.text}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
