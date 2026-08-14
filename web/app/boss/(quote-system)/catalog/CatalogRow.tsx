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
  const [note, setNote] = useState(item.note ?? '');
  const [toggleBusy, setToggleBusy] = useState(false);

  const inputCls = 'nm-input text-[13px]';

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
          note: note.trim() || null,
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

  async function toggleActive() {
    setError(null);
    setToggleBusy(true);
    try {
      const res = await fetch(`/api/catalog/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !item.active }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error ?? '操作失敗');
        setToggleBusy(false);
        return;
      }
      setToggleBusy(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '網路錯誤');
      setToggleBusy(false);
    }
  }

  const rowBorder = { borderTop: '1px solid rgba(255,255,255,0.04)' };

  if (editing) {
    return (
      <tr style={rowBorder} className="align-top">
        <td className="px-2 py-1.5"><input value={brand} onChange={(e) => setBrand(e.target.value)} className={inputCls} /></td>
        <td className="px-2 py-1.5"><input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} /></td>
        <td className="px-2 py-1.5"><input value={itemType} onChange={(e) => setItemType(e.target.value)} className={inputCls} /></td>
        <td className="px-2 py-1.5"><input value={unit} onChange={(e) => setUnit(e.target.value)} className={`${inputCls} w-14`} /></td>
        <td className="px-2 py-1.5">
          <input inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value)} className={`${inputCls} text-right`} placeholder="—" />
        </td>
        <td className="px-2 py-1.5">
          <input inputMode="numeric" value={sell} onChange={(e) => setSell(e.target.value)} className={`${inputCls} text-right`} placeholder="待設定" />
        </td>
        <td className="px-2 py-1.5"><input value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls} /></td>
        <td className="px-2 py-1.5" colSpan={2}>
          <div className="flex flex-col gap-1">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="備註" className={inputCls} />
            <div className="flex gap-3 justify-end whitespace-nowrap">
              <button onClick={save} disabled={busy} className="text-[13px] nm-focus disabled:opacity-50" style={{ color: 'var(--nm-success)' }}>
                {busy ? '存…' : '儲存'}
              </button>
              <button onClick={() => { setEditing(false); setError(null); }} className="text-[13px] nm-focus" style={{ color: 'var(--nm-text-muted)' }}>取消</button>
            </div>
            {error && <span className="text-xs" style={{ color: 'var(--nm-danger)' }}>{error}</span>}
          </div>
        </td>
      </tr>
    );
  }

  const noSell = item.sell_price_twd === null;
  return (
    <tr style={rowBorder} className={item.active ? undefined : 'opacity-50'}>
      <td className="px-3.5 py-3 whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>{item.brand ?? '—'}</td>
      <td className="px-3.5 py-3 font-medium whitespace-nowrap" style={{ color: 'var(--nm-text-body)' }}>
        {item.name}
        {!item.active && <span className="nm-pill ml-2 whitespace-nowrap">已下架</span>}
        {item.note && <div className="text-xs font-normal" style={{ color: 'var(--nm-text-muted)' }}>{item.note}</div>}
      </td>
      <td className="px-3.5 py-3 whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>{item.item_type ?? '—'}</td>
      <td className="px-3.5 py-3 whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>{item.unit}</td>
      <td className="px-3.5 py-3 text-right tabular whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>{item.cost_price_twd !== null ? fmt(item.cost_price_twd) : '—'}</td>
      <td className="px-3.5 py-3 text-right tabular whitespace-nowrap" style={{ color: 'var(--nm-text-body)' }}>
        {noSell ? (
          <span className="nm-pill nm-pill-warning whitespace-nowrap">待設定售價</span>
        ) : (
          fmt(item.sell_price_twd as number)
        )}
      </td>
      <td className="px-3.5 py-3 whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>{item.category ?? '—'}</td>
      <td className="px-5 py-3 text-right">
        <div className="flex gap-3 justify-end whitespace-nowrap">
          <button
            onClick={toggleActive}
            disabled={toggleBusy}
            className="nm-focus disabled:opacity-50"
            style={{ color: item.active ? 'var(--nm-danger)' : 'var(--nm-success)', borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: 1 }}
          >
            {toggleBusy ? '…' : item.active ? '下架' : '上架'}
          </button>
          <button
            onClick={() => setEditing(true)}
            className="nm-focus"
            style={{ color: '#8a8b90', borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: 1 }}
          >
            編輯
          </button>
        </div>
        {error && <div className="text-xs mt-1" style={{ color: 'var(--nm-danger)' }}>{error}</div>}
      </td>
    </tr>
  );
}
