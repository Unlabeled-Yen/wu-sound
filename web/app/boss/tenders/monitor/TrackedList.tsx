'use client';

// 追蹤中清單(05-tender-watch.md §5)。設計稿原本六欄(倒數/案名+機關/預算/領標家數/
// 預測主要對手/勝率),這裡只畫前三欄——後三欄需要 tender-radar 目前沒有的資料
// (逐廠商行為分析、勝率估計),不畫假欄位,等後端資料模型定案再補回來。
// 純快速一覽,完整內容還是下方既有的 TenderCard——點一列用錨點捲過去,不重複造一套詳情。

import { useState } from 'react';
import { daysLeft, formatCountdown, type TenderHit } from './shared';

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
        <span className="mr-1 text-xs" style={{ color: 'var(--nm-text-muted)' }}>排序</span>
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
        <table className="w-full text-[13px]" style={{ minWidth: 560, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: 'var(--nm-text-muted)', background: 'rgba(20,20,24,0.6)' }}>
              <th className="py-2 px-3 text-left text-xs font-normal" style={{ width: 88 }}>倒數</th>
              <th className="py-2 px-3 text-left text-xs font-normal">案名 · 機關</th>
              <th className="py-2 px-3 text-right text-xs font-normal" style={{ width: 120 }}>預算</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((h) => {
              const left = daysLeft(h);
              const countdown = formatCountdown(h);
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
                      <span className="ml-1.5 text-xs" style={{ color: 'var(--nm-text-muted)' }}>
                        {h.unit_name || h.unit_id || '未知機關'}
                      </span>
                    </a>
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums" style={{ color: 'var(--nm-text-secondary)' }}>
                    {h.budget_status === 'value' && h.budget !== null
                      ? `$${(h.budget / 100 / 10000).toLocaleString('zh-TW', { maximumFractionDigits: 0 })} 萬`
                      : '—'}
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
