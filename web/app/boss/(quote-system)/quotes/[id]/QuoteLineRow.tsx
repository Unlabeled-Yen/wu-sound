'use client';

import { useRef, useState } from 'react';
import type { QuoteLine, QuoteLineSection } from '@/lib/types';
import { computeLineMargin } from '@/lib/quote-calc';

const fmt = (n: number) => n.toLocaleString('zh-TW');

const inputCls = 'min-h-[36px] w-full px-2.5 rounded-[11px] text-[13px] outline-none bg-transparent';
const inputStyle: React.CSSProperties = { background: 'rgba(8,8,10,.5)', border: '1px solid rgba(255,255,255,.13)', color: 'var(--nm-text-body)' };

// 明細列:固定寬度欄位(數量96px/單價104px/小計120px/⋯24px)+等寬數字,金額欄
// 固定在同一個 x 位置——這是整份文件唯一的視覺掃描軸。行內編輯就地把欄位換成
// 同寬的輸入格,不新增下拉、不換行、不改列高,避免使用者編輯時失去閱讀位置。
//
// 待補價列是全頁唯一的警示色:整列淡黃底,單價欄直接是一個常駐可打字的輸入格
// (不需要先進入整列編輯模式),小計顯示「—」。
export default function QuoteLineRow({
  line, index, quoteId, unitCost, onChanged, onDeleted, showMargin, priceInputRef,
}: {
  line: QuoteLine;
  index: number;
  quoteId: string;
  unitCost: number | null | undefined;
  onChanged: (l: QuoteLine) => void;
  onDeleted: (id: string) => void;
  showMargin: boolean;
  priceInputRef?: (el: HTMLInputElement | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const [name, setName] = useState(line.name);
  const [spec, setSpec] = useState(line.spec ?? '');
  const [qty, setQty] = useState(String(line.qty));
  const [unit, setUnit] = useState(line.unit ?? '');
  const [price, setPrice] = useState(line.unit_price_twd !== null ? String(line.unit_price_twd) : '');
  const [quickPrice, setQuickPrice] = useState('');
  const [saveToCatalog, setSaveToCatalog] = useState(false);

  const noPrice = line.unit_price_twd === null;
  const subtotal = line.unit_price_twd !== null ? line.qty * line.unit_price_twd : null;
  const margin = computeLineMargin(line, unitCost);

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
    const priceVal = price.trim() === '' ? null : Number(price);
    const updated = await callLines('update', {
      id: line.id, name: name.trim(), spec: spec.trim() || null, qty: Number(qty),
      unit: unit.trim() || null, unit_price_twd: priceVal, section: line.section,
    });
    if (!updated) { setBusy(false); return; }
    if (saveToCatalog && line.catalog_item_id && priceVal !== null) {
      await fetch(`/api/catalog/${line.catalog_item_id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sell_price_twd: priceVal }),
      }).catch(() => {});
    }
    setEditing(false);
    setBusy(false);
    onChanged(updated);
  }

  async function saveQuickPrice() {
    const v = quickPrice.trim();
    if (v === '') return;
    const priceVal = Number(v);
    if (!Number.isFinite(priceVal)) { setError('單價必須是數字'); return; }
    setError(null);
    setBusy(true);
    const updated = await callLines('update', {
      id: line.id, name: line.name, spec: line.spec, qty: line.qty,
      unit: line.unit, unit_price_twd: priceVal, section: line.section,
    });
    setBusy(false);
    if (updated) onChanged(updated);
  }

  async function moveSection(next: QuoteLineSection) {
    setMenuOpen(false);
    setBusy(true);
    const updated = await callLines('update', {
      id: line.id, name: line.name, spec: line.spec, qty: line.qty,
      unit: line.unit, unit_price_twd: line.unit_price_twd, section: next,
    });
    setBusy(false);
    if (updated) onChanged(updated);
  }

  async function saveToCatalogNow() {
    setMenuOpen(false);
    if (!line.catalog_item_id || line.unit_price_twd === null) return;
    await fetch(`/api/catalog/${line.catalog_item_id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sell_price_twd: line.unit_price_twd }),
    }).catch(() => {});
  }

  async function del() {
    setMenuOpen(false);
    setError(null);
    setBusy(true);
    const res = await fetch(`/api/quotes/${quoteId}/lines`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', line: { id: line.id } }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setError(j.error ?? '刪除失敗'); setBusy(false); return; }
    onDeleted(line.id);
  }

  const rowStyle: React.CSSProperties = {
    borderBottom: '1px solid var(--nm-border-hair)',
    background: noPrice ? 'rgba(217,181,107,.05)' : undefined,
  };

  return (
    <div className="flex items-center gap-4 py-3.5" style={rowStyle}>
      <div className="w-[18px] shrink-0 text-[12px]" style={{ color: 'var(--nm-text-faint)' }}>{index + 1}</div>

      {editing ? (
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} style={inputStyle} placeholder="名稱" />
          <input value={spec} onChange={(e) => setSpec(e.target.value)} className={inputCls} style={inputStyle} placeholder="規格(選填)" />
          {line.catalog_item_id && (
            <label className="flex items-center gap-1.5 text-[11.5px] mt-0.5" style={{ color: 'var(--nm-text-muted)' }}>
              <input type="checkbox" checked={saveToCatalog} onChange={(e) => setSaveToCatalog(e.target.checked)} />
              存回價目表
            </label>
          )}
        </div>
      ) : (
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-medium truncate" style={{ color: 'var(--nm-text-body)' }}>{line.name}</span>
            {line.is_ai_suggested && (
              <span className="shrink-0 px-2 py-0.5 rounded-full text-[10.5px]" style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', color: '#b8b8bb' }}>AI 建議</span>
            )}
          </div>
          <div className="text-[12px] mt-1" style={{ color: 'var(--nm-text-muted)' }}>
            {noPrice ? '手動加入　·　未連價目表' : (line.spec ?? ' ')}
          </div>
        </div>
      )}

      <div className="w-24 shrink-0 text-right">
        {editing ? (
          <div className="flex gap-1">
            <input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} className={`${inputCls} text-right`} style={inputStyle} />
          </div>
        ) : (
          <span className="text-[13px] tabular-nums" style={{ color: 'var(--nm-text-secondary)' }}>{line.qty}{line.unit ? ` ${line.unit}` : ''}</span>
        )}
      </div>

      <div className="w-[104px] shrink-0 flex justify-end">
        {editing ? (
          <input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} className={`${inputCls} text-right`} style={inputStyle} placeholder="待設定" />
        ) : noPrice ? (
          <input
            ref={priceInputRef}
            inputMode="numeric"
            value={quickPrice}
            onChange={(e) => setQuickPrice(e.target.value)}
            onBlur={saveQuickPrice}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            placeholder="輸入單價"
            className="min-h-[36px] w-full px-2.5 rounded-[11px] text-[13px] text-right outline-none tabular-nums"
            style={{ background: 'rgba(8,8,10,.5)', border: '1.5px solid var(--nm-warning)', color: 'var(--nm-warning-glass-text)' }}
          />
        ) : (
          <span className="text-[13px] tabular-nums" style={{ color: 'var(--nm-text-secondary)' }}>${fmt(line.unit_price_twd as number)}</span>
        )}
      </div>

      <div className="w-[120px] shrink-0 text-right text-[14px] font-medium tabular-nums" style={{ color: subtotal !== null ? 'var(--nm-text-primary)' : 'var(--nm-text-faint)' }}>
        {subtotal !== null ? `$${fmt(subtotal)}` : '—'}
      </div>

      {showMargin && (
        <div className="w-12 shrink-0 text-right text-[12px] tabular-nums print-hide" style={{ color: margin.costKnown ? 'var(--nm-text-secondary)' : 'var(--nm-text-faint)' }}>
          {margin.marginPct !== null ? `${margin.marginPct.toFixed(0)}%` : '—'}
        </div>
      )}

      <div className="w-6 shrink-0 relative print-hide">
        {editing ? (
          <div className="absolute right-0 top-1/2 -translate-y-1/2 flex flex-col gap-1 whitespace-nowrap">
            <button type="button" onClick={save} disabled={busy} className="text-[12px] underline disabled:opacity-50" style={{ color: 'var(--nm-success)' }}>{busy ? '存…' : '儲存'}</button>
            <button type="button" onClick={() => { setEditing(false); setError(null); }} className="text-[12px] underline" style={{ color: 'var(--nm-text-muted)' }}>取消</button>
          </div>
        ) : (
          <button type="button" onClick={() => setMenuOpen((v) => !v)} className="text-[15px]" style={{ color: 'var(--nm-text-faint)' }}>⋯</button>
        )}
        {menuOpen && (
          <div className="absolute right-0 top-6 z-20 w-40 rounded-[13px] py-1.5 nm-raised-lg" style={{ background: '#1a1c20' }}>
            <button type="button" onClick={() => { setMenuOpen(false); setEditing(true); }} className="block w-full text-left px-3 py-1.5 text-[12.5px]" style={{ color: 'var(--nm-text-body)' }}>編輯</button>
            <button type="button" onClick={() => moveSection(line.section === '器材' ? '安裝' : '器材')} className="block w-full text-left px-3 py-1.5 text-[12.5px]" style={{ color: 'var(--nm-text-body)' }}>
              移到{line.section === '器材' ? '安裝' : '器材'}
            </button>
            {line.catalog_item_id && line.unit_price_twd !== null && (
              <button type="button" onClick={saveToCatalogNow} className="block w-full text-left px-3 py-1.5 text-[12.5px]" style={{ color: 'var(--nm-text-body)' }}>存回價目表</button>
            )}
            <button type="button" onClick={del} disabled={busy} className="block w-full text-left px-3 py-1.5 text-[12.5px] disabled:opacity-50" style={{ color: 'var(--nm-danger-glass-text)' }}>刪除</button>
          </div>
        )}
        {error && <div className="absolute right-0 top-6 w-40 text-[11px] text-right" style={{ color: 'var(--nm-danger)' }}>{error}</div>}
      </div>
    </div>
  );
}
