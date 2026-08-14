'use client';

import { useState } from 'react';

// 手機(<1024px):收入/支出改為切換,一次只看一邊,取代桌機的並排雙欄——
// 兩個欄位在窄螢幕上會被壓成又高又窄的兩個直條,不如切換好讀。
// 桌機維持並排(在 AllView 用 hidden lg:grid 的另一份 markup 呈現,不受這個元件影響)。
export function IncomeExpenseTabs({ income, expense }: { income: React.ReactNode; expense: React.ReactNode }) {
  const [tab, setTab] = useState<'income' | 'expense'>('income');
  return (
    <div className="lg:hidden">
      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={() => setTab('income')}
          className={`flex-1 text-[13px] ${tab === 'income' ? 'nm-btn-solid' : 'nm-btn'}`}
        >
          收入
        </button>
        <button
          type="button"
          onClick={() => setTab('expense')}
          className={`flex-1 text-[13px] ${tab === 'expense' ? 'nm-btn-solid' : 'nm-btn'}`}
        >
          支出
        </button>
      </div>
      {tab === 'income' ? income : expense}
    </div>
  );
}
