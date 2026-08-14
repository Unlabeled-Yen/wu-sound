'use client';

import { useState } from 'react';

// 手機(<1024px):收入/支出改為切換,一次只看一邊,取代桌機的並排雙欄——
// 兩個欄位在窄螢幕上會被壓成又高又窄的兩個直條,不如切換好讀。
// 桌機維持並排(在 AllView 用 hidden lg:grid 的另一份 markup 呈現,不受這個元件影響)。
// 選中的分段照原型 2b 走方向色(收入=綠、支出=紅)實心底,不是通用白底。
export function IncomeExpenseTabs({ income, expense }: { income: React.ReactNode; expense: React.ReactNode }) {
  const [tab, setTab] = useState<'income' | 'expense'>('income');
  return (
    <div className="lg:hidden">
      <div className="nm-inset flex gap-1" style={{ borderRadius: 999, padding: 4, marginBottom: 12 }}>
        <button
          type="button"
          onClick={() => setTab('income')}
          className="flex-1 text-[13px] text-center"
          style={{
            borderRadius: 999, padding: '10px 0', fontWeight: 600,
            background: tab === 'income' ? 'var(--nm-success)' : 'transparent',
            color: tab === 'income' ? '#0f1f16' : 'var(--nm-text-secondary)',
          }}
        >
          收入
        </button>
        <button
          type="button"
          onClick={() => setTab('expense')}
          className="flex-1 text-[13px] text-center"
          style={{
            borderRadius: 999, padding: '10px 0', fontWeight: 600,
            background: tab === 'expense' ? 'var(--nm-danger)' : 'transparent',
            color: tab === 'expense' ? '#2a0f0f' : 'var(--nm-text-secondary)',
          }}
        >
          支出
        </button>
      </div>
      {tab === 'income' ? income : expense}
    </div>
  );
}
