'use client';

import { useState } from 'react';
import type { BundleLine, QuoteLineSection } from '@/lib/types';

export default function BundleLineRow({
  line,
  index,
  bundleId,
  onChanged,
  onDeleted,
}: {
  line: BundleLine;
  index: number;
  bundleId: string;
  onChanged: (l: BundleLine) => void;
  onDeleted: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(line.name);
  const [spec, setSpec] = useState(line.spec ?? '');
  const [qty, setQty] = useState(String(line.qty));
  const [unit, setUnit] = useState(line.unit ?? '');
  const [section, setSection] = useState<QuoteLineSection>(line.section);

  const inputCls = 'nm-input text-[13px]';

  async function callLines(action: string, payload: Record<string, unknown>): Promise<BundleLine | null> {
    const res = await fetch(`/api/bundles/${bundleId}/lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, line: payload }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setError(j.error ?? '操作失敗'); return null; }
    return (j.line ?? null) as BundleLine | null;
  }

  async function save() {
    setError(null);
    setBusy(true);
    try {
      const updated = await callLines('update', {
        id: line.id,
        name: name.trim(),
        spec: spec.trim() || null,
        qty: Number(qty),
        unit: unit.trim() || null,
        section,
      });
      if (!updated) { setBusy(false); return; }
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
      const res = await fetch(`/api/bundles/${bundleId}/lines`, {
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
      <tr className="align-top" style={{ borderTop: '1px solid var(--nm-border-hair)' }}>
        <td className="px-2 py-2 whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>{index + 1}</td>
        <td className="px-2 py-1">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          <select
            value={section}
            onChange={(e) => setSection(e.target.value as QuoteLineSection)}
            className="nm-input text-[12px] mt-1"
            style={{ minHeight: 28, padding: '2px 6px' }}
          >
            <option value="器材">器材</option>
            <option value="安裝">安裝</option>
          </select>
        </td>
        <td className="px-2 py-1"><input value={spec} onChange={(e) => setSpec(e.target.value)} className={inputCls} /></td>
        <td className="px-2 py-1"><input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} className={`${inputCls} w-16 text-right`} /></td>
        <td className="px-2 py-1"><input value={unit} onChange={(e) => setUnit(e.target.value)} className={`${inputCls} w-14`} /></td>
        <td className="px-2 py-2">
          <div className="flex flex-col gap-1">
            <div className="flex gap-2 whitespace-nowrap">
              <button onClick={save} disabled={busy} className="nm-focus underline disabled:opacity-50" style={{ color: 'var(--nm-success)' }}>{busy ? '存…' : '儲存'}</button>
              <button onClick={() => { setEditing(false); setError(null); }} className="nm-focus underline" style={{ color: 'var(--nm-text-muted)' }}>取消</button>
            </div>
            {error && <span className="text-xs" style={{ color: 'var(--nm-danger)' }}>{error}</span>}
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr style={{ borderTop: '1px solid var(--nm-border-hair)' }}>
      <td className="px-2 py-2 whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>{index + 1}</td>
      <td className="px-3 py-2 whitespace-nowrap">
        <div className="font-medium" style={{ color: 'var(--nm-text-body)' }}>{line.name}</div>
        {!line.catalog_item_id && (
          <span
            className="inline-block mt-0.5 text-[11px] px-1.5 py-0.5 rounded"
            style={{ color: 'var(--nm-text-secondary)', background: 'rgba(140, 120, 200, 0.15)' }}
          >自由行</span>
        )}
      </td>
      <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>{line.spec ?? '—'}</td>
      <td className="px-3 py-2 text-right whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>{line.qty}</td>
      <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>{line.unit ?? '—'}</td>
      <td className="px-3 py-2 whitespace-nowrap">
        <div className="flex gap-2">
          <button onClick={() => setEditing(true)} className="underline" style={{ color: 'var(--nm-text-secondary)' }}>編輯</button>
          <button onClick={del} disabled={busy} className="underline disabled:opacity-50" style={{ color: 'var(--nm-danger-glass-text)' }}>刪除</button>
        </div>
        {error && <div className="text-xs" style={{ color: 'var(--nm-danger)' }}>{error}</div>}
      </td>
    </tr>
  );
}
