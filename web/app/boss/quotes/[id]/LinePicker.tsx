'use client';

import { useEffect, useState } from 'react';
import type { CatalogItem } from '@/lib/types';

const fmt = (n: number) => n.toLocaleString('zh-TW');

export default function LinePicker({
  onPick,
  onClose,
}: {
  onPick: (item: CatalogItem) => void | Promise<void>;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/catalog?q=${encodeURIComponent(q.trim())}`);
        const j = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) { setError(j.error ?? '查詢失敗'); setItems([]); }
        else setItems((j.items ?? []) as CatalogItem[]);
      } catch {
        if (!cancelled) setError('網路錯誤');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-16">
      <div className="w-full max-w-2xl rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex flex-col max-h-[70vh]">
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-2">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜尋品名 / 品牌 / 類型"
            className="flex-1 border border-neutral-300 dark:border-neutral-700 rounded px-3 py-2 bg-white dark:bg-neutral-900"
          />
          <button onClick={onClose} className="px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700">關閉</button>
        </div>
        <div className="overflow-y-auto">
          {loading && <div className="px-4 py-6 text-center text-neutral-500">查詢中…</div>}
          {error && <div className="px-4 py-4 text-red-600">{error}</div>}
          {!loading && !error && items.length === 0 && (
            <div className="px-4 py-6 text-center text-neutral-500">沒有符合的品項</div>
          )}
          <table className="w-full text-sm">
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="border-t border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 cursor-pointer"
                  onClick={() => onPick(item)}
                >
                  <td className="px-3 py-2">{item.brand ?? ''}</td>
                  <td className="px-3 py-2 font-medium">{item.name}</td>
                  <td className="px-3 py-2 text-neutral-500">{item.item_type ?? ''}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {item.sell_price_twd !== null ? `$${fmt(item.sell_price_twd)}` : (
                      <span className="text-amber-600 dark:text-amber-400 text-xs">待設定售價</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
