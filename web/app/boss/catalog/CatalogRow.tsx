'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CatalogItem } from '@/lib/types';

const fmt = (n: number) => n.toLocaleString('zh-TW');

export default function CatalogRow({ item }: { item: CatalogItem }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [brand, setBrand] = useState(item.brand ?? '');
  const [name, setName] = useState(item.name);
  const [itemType, setItemType] = useState(item.item_type ?? '');
  const [unit, setUnit] = useState(item.unit);
  const [cost, setCost] = useState(item.cost_price_twd !== null ? String(item.cost_price_twd) : '');
  const [sell, setSell] = useState(item.sell_price_twd !== null ? String(item.sell_price_twd) : '');
  const [category, setCategory] = useState(item.category ?? '');

  const inputCls = 'w-full border border-neutral-300 dark:border-neutral-700 rounded px-2 py-1 bg-white dark:bg-neutral-900';

  async function save() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/catalog/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand: brand.trim() || null,
          name: name.trim(),
          item_type: itemType.trim() || null,
          unit: unit.trim() || '式',
          cost_price_twd: cost.trim() === '' ? null : Number(cost),
          sell_price_twd: sell.trim() === '' ? null : Number(sell),
          category: category.trim() || null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error ?? '儲存失敗');
        setBusy(false);
        return;
      }
      setEditing(false);
      setBusy(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '網路錯誤');
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <tr className="border-t border-neutral-100 dark:border-neutral-800 align-top">
        <td className="px-2 py-1"><input value={brand} onChange={(e) => setBrand(e.target.value)} className={inputCls} /></td>
        <td className="px-2 py-1"><input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} /></td>
        <td className="px-2 py-1"><input value={itemType} onChange={(e) => setItemType(e.target.value)} className={inputCls} /></td>
        <td className="px-2 py-1"><input value={unit} onChange={(e) => setUnit(e.target.value)} className={`${inputCls} w-14`} /></td>
        <td className="px-2 py-1">
          <input inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value)} className={`${inputCls} text-right`} placeholder="—" />
        </td>
        <td className="px-2 py-1">
          <input inputMode="numeric" value={sell} onChange={(e) => setSell(e.target.value)} className={`${inputCls} text-right`} placeholder="待設定" />
        </td>
        <td className="px-2 py-1"><input value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls} /></td>
        <td className="px-2 py-1">
          <div className="flex flex-col gap-1">
            <div className="flex gap-2">
              <button onClick={save} disabled={busy} className="text-emerald-600 underline disabled:opacity-50">
                {busy ? '存…' : '儲存'}
              </button>
              <button onClick={() => { setEditing(false); setError(null); }} className="text-neutral-500 underline">取消</button>
            </div>
            {error && <span className="text-xs text-red-600">{error}</span>}
          </div>
        </td>
      </tr>
    );
  }

  const noSell = item.sell_price_twd === null;
  return (
    <tr className="border-t border-neutral-100 dark:border-neutral-800">
      <td className="px-3 py-2">{item.brand ?? '—'}</td>
      <td className="px-3 py-2 font-medium">{item.name}</td>
      <td className="px-3 py-2">{item.item_type ?? '—'}</td>
      <td className="px-3 py-2">{item.unit}</td>
      <td className="px-3 py-2 text-right font-mono">{item.cost_price_twd !== null ? fmt(item.cost_price_twd) : '—'}</td>
      <td className="px-3 py-2 text-right font-mono">
        {noSell ? (
          <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
            待設定售價
          </span>
        ) : (
          fmt(item.sell_price_twd as number)
        )}
      </td>
      <td className="px-3 py-2">{item.category ?? '—'}</td>
      <td className="px-3 py-2">
        <button onClick={() => setEditing(true)} className="text-blue-600 dark:text-blue-400 underline">編輯</button>
      </td>
    </tr>
  );
}
