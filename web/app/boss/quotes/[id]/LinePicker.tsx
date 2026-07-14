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
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-16">
      <div className="w-full max-w-2xl rounded-2xl nm-raised-lg flex flex-col max-h-[70vh]" style={{ background: 'rgba(24,24,28,0.75)' }}>
        <div className="p-4 flex items-center gap-2" style={{ borderBottom: '1px solid var(--nm-border-hair)' }}>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜尋品名 / 品牌 / 類型"
            className="flex-1 nm-input"
          />
          <button onClick={onClose} className="nm-btn text-[13px]">關閉</button>
        </div>
        <div className="overflow-y-auto overflow-x-auto">
          {loading && <div className="px-4 py-6 text-center" style={{ color: 'var(--nm-text-secondary)' }}>查詢中…</div>}
          {error && <div className="px-4 py-4" style={{ color: 'var(--nm-danger)' }}>{error}</div>}
          {!loading && !error && items.length === 0 && (
            <div className="px-4 py-6 text-center" style={{ color: 'var(--nm-text-secondary)' }}>沒有符合的品項</div>
          )}
          <table className="w-full text-[13px]" style={{ minWidth: 600, borderCollapse: 'collapse' }}>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="cursor-pointer nm-lift"
                  style={{ borderTop: '1px solid var(--nm-border-hair)' }}
                  onClick={() => onPick(item)}
                >
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>{item.brand ?? ''}</td>
                  <td className="px-3 py-2 font-medium whitespace-nowrap" style={{ color: 'var(--nm-text-body)' }}>{item.name}</td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>{item.item_type ?? ''}</td>
                  <td className="px-3 py-2 text-right font-mono tabular whitespace-nowrap">
                    {item.sell_price_twd !== null ? (
                      <span style={{ color: 'var(--nm-text-body)' }}>${fmt(item.sell_price_twd)}</span>
                    ) : (
                      <span className="nm-pill nm-pill-warning">待設定售價</span>
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
