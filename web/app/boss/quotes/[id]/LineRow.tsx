'use client';

import { useState } from 'react';
import type { QuoteLine } from '@/lib/types';

const fmt = (n: number) => n.toLocaleString('zh-TW');

export default function LineRow({
  line,
  index,
  quoteId,
  onChanged,
  onDeleted,
}: {
  line: QuoteLine;
  index: number;
  quoteId: string;
  onChanged: (l: QuoteLine) => void;
  onDeleted: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(line.name);
  const [spec, setSpec] = useState(line.spec ?? '');
  const [qty, setQty] = useState(String(line.qty));
  const [unit, setUnit] = useState(line.unit ?? '');
  const [price, setPrice] = useState(line.unit_price_twd !== null ? String(line.unit_price_twd) : '');
  const [saveToCatalog, setSaveToCatalog] = useState<boolean>(Boolean(line.catalog_item_id));

  const noPrice = line.unit_price_twd === null;
  const subtotal = line.unit_price_twd !== null ? line.qty * line.unit_price_twd : null;
  const inputCls = 'w-full border border-neutral-300 dark:border-neutral-700 rounded px-2 py-1 bg-white dark:bg-neutral-900';

  async function callLines(action: string, payload: Record<string, unknown>): Promise<QuoteLine | null> {
    const res = await fetch(`/api/quotes/${quoteId}/lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, line: payload }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setError(j.error ?? '操作失敗'); return null; }
    return (j.line ?? null) as QuoteLine | null;
  }

  async function save() {
    setError(null);
    setBusy(true);
    try {
      const priceVal = price.trim() === '' ? null : Number(price);
      const updated = await callLines('update', {
        id: line.id,
        name: name.trim(),
        spec: spec.trim() || null,
        qty: Number(qty),
        unit: unit.trim() || null,
        unit_price_twd: priceVal,
      });
      if (!updated) { setBusy(false); return; }
      // 有連品項庫、且勾選存回、且有填價 → 同時更新品項庫售價
      if (saveToCatalog && line.catalog_item_id && priceVal !== null) {
        await fetch(`/api/catalog/${line.catalog_item_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sell_price_twd: priceVal }),
        }).catch(() => {});
      }
      setEditing(false);
      setBusy(false);
      onChanged(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : '網路錯誤');
      setBusy(false);
    }
  }

  async function del() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/lines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', line: { id: line.id } }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error ?? '刪除失敗'); setBusy(false); return; }
      onDeleted(line.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : '網路錯誤');
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <tr className="border-t border-neutral-100 dark:border-neutral-800 align-top">
        <td className="px-2 py-2 text-neutral-500">{index + 1}</td>
        <td className="px-2 py-1"><input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} /></td>
        <td className="px-2 py-1"><input value={spec} onChange={(e) => setSpec(e.target.value)} className={inputCls} /></td>
        <td className="px-2 py-1"><input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} className={`${inputCls} w-16 text-right`} /></td>
        <td className="px-2 py-1"><input value={unit} onChange={(e) => setUnit(e.target.value)} className={`${inputCls} w-14`} /></td>
        <td className="px-2 py-1">
          <input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} className={`${inputCls} w-24 text-right`} placeholder="待設定" />
          {line.catalog_item_id && (
            <label className="flex items-center gap-1 mt-1 text-xs text-neutral-500">
              <input type="checkbox" checked={saveToCatalog} onChange={(e) => setSaveToCatalog(e.target.checked)} />
              存回品項庫
            </label>
          )}
        </td>
        <td className="px-2 py-2 text-right text-neutral-400">—</td>
        <td className="px-2 py-2">
          <div className="flex flex-col gap-1">
            <div className="flex gap-2">
              <button onClick={save} disabled={busy} className="text-emerald-600 underline disabled:opacity-50">{busy ? '存…' : '儲存'}</button>
              <button onClick={() => { setEditing(false); setError(null); }} className="text-neutral-500 underline">取消</button>
            </div>
            {error && <span className="text-xs text-red-600">{error}</span>}
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t border-neutral-100 dark:border-neutral-800">
      <td className="px-2 py-2 text-neutral-500">{index + 1}</td>
      <td className="px-3 py-2">
        <div className="font-medium">{line.name}</div>
        {line.is_ai_suggested && (
          <span className="inline-block mt-0.5 text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200">AI 建議</span>
        )}
      </td>
      <td className="px-3 py-2 text-neutral-600 dark:text-neutral-400">{line.spec ?? '—'}</td>
      <td className="px-3 py-2 text-right">{line.qty}</td>
      <td className="px-3 py-2">{line.unit ?? '—'}</td>
      <td className="px-3 py-2 text-right font-mono">
        {noPrice ? (
          <button onClick={() => setEditing(true)} className="inline-block text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 underline">
            待設定售價
          </button>
        ) : (
          `$${fmt(line.unit_price_twd as number)}`
        )}
      </td>
      <td className="px-3 py-2 text-right font-mono">{subtotal !== null ? `$${fmt(subtotal)}` : '—'}</td>
      <td className="px-3 py-2 print-hide">
        <div className="flex gap-2">
          <button onClick={() => setEditing(true)} className="text-blue-600 dark:text-blue-400 underline">編輯</button>
          <button onClick={del} disabled={busy} className="text-rose-600 dark:text-rose-400 underline disabled:opacity-50">刪除</button>
        </div>
        {error && <div className="text-xs text-red-600">{error}</div>}
      </td>
    </tr>
  );
}
