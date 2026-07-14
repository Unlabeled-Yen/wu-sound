'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewItemButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [brand, setBrand] = useState('');
  const [name, setName] = useState('');
  const [itemType, setItemType] = useState('');
  const [unit, setUnit] = useState('式');
  const [cost, setCost] = useState('');
  const [sell, setSell] = useState('');
  const [category, setCategory] = useState('');

  const inputCls = 'w-full border border-neutral-300 dark:border-neutral-700 rounded px-3 py-2 bg-white dark:bg-neutral-900';

  async function submit() {
    setError(null);
    if (!name.trim()) { setError('請填品名'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/catalog', {
        method: 'POST',
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
      if (!res.ok) { setError(j.error ?? '新增失敗'); setBusy(false); return; }
      setBusy(false);
      setOpen(false);
      setBrand(''); setName(''); setItemType(''); setUnit('式'); setCost(''); setSell(''); setCategory('');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '網路錯誤');
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 rounded bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
      >
        新增品項
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-5 space-y-3">
        <h2 className="text-lg font-semibold">新增品項</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label className="col-span-1">品牌<input value={brand} onChange={(e) => setBrand(e.target.value)} className={inputCls} /></label>
          <label className="col-span-1">品名 *<input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} /></label>
          <label className="col-span-1">類型<input value={itemType} onChange={(e) => setItemType(e.target.value)} className={inputCls} /></label>
          <label className="col-span-1">單位<input value={unit} onChange={(e) => setUnit(e.target.value)} className={inputCls} /></label>
          <label className="col-span-1">進價<input inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value)} className={inputCls} placeholder="可留空" /></label>
          <label className="col-span-1">售價<input inputMode="numeric" value={sell} onChange={(e) => setSell(e.target.value)} className={inputCls} placeholder="可留空" /></label>
          <label className="col-span-2">分類<input value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls} /></label>
        </div>
        {error && <div className="text-sm text-red-600">{error}</div>}
        <div className="flex gap-3 justify-end pt-1">
          <button onClick={() => { setOpen(false); setError(null); }} className="px-4 py-2 rounded border border-neutral-300 dark:border-neutral-700">取消</button>
          <button onClick={submit} disabled={busy} className="px-4 py-2 rounded bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 disabled:opacity-50">
            {busy ? '新增中…' : '新增'}
          </button>
        </div>
      </div>
    </div>
  );
}
