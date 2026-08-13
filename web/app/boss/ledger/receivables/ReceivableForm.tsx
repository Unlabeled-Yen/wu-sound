'use client';

import { useEffect, useState } from 'react';
import type { ReceivableDirection } from '@/lib/types';
import { validateReceivable } from '@/lib/receivable-validation';

export default function ReceivableForm() {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<ReceivableDirection>('receivable');
  const [party, setParty] = useState('');
  const [siteId, setSiteId] = useState('');
  const [sites, setSites] = useState<Array<{ id: string; name: string }>>([]);
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch('/api/sites?active=1', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setSites(j.sites ?? []))
      .catch(() => {});
  }, [open]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const input = {
      direction,
      party: party.trim(),
      site_id: siteId || null,
      total_amount_twd: Number(amount),
      memo: memo.trim() || null,
    };
    const err = validateReceivable(input);
    if (err) { setError(err); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/receivables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || '新增失敗');
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : '新增失敗');
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="nm-btn-solid text-[13px]">
        新增一筆約定
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="nm-raised rounded-2xl p-4 space-y-3 max-w-lg">
      <div>
        <label className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>方向</label>
        <div className="flex gap-3 mt-1" style={{ color: 'var(--nm-text-body)' }}>
          <label className="flex items-center gap-1">
            <input type="radio" checked={direction === 'receivable'} onChange={() => setDirection('receivable')} /> 應收
          </label>
          <label className="flex items-center gap-1">
            <input type="radio" checked={direction === 'payable'} onChange={() => setDirection('payable')} /> 應付
          </label>
        </div>
      </div>
      <div>
        <label className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>對象</label>
        <input value={party} onChange={(e) => setParty(e.target.value)} className="nm-input" required />
      </div>
      <div>
        <label className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>案場/專案(選填)</label>
        <select value={siteId} onChange={(e) => setSiteId(e.target.value)} className="nm-input">
          <option value="">— 不掛專案 —</option>
          {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div>
        <label className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>約定總額(元)</label>
        <input type="number" inputMode="numeric" min={1} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} className="nm-input" required />
      </div>
      <div>
        <label className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>備註</label>
        <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={2} className="nm-input" />
      </div>
      {error && (
        <div className="rounded-xl px-3 py-2 text-[13px]" style={{ background: 'rgba(224,122,122,0.08)', border: '1px solid rgba(224,122,122,0.34)', color: 'var(--nm-danger-glass-text)' }}>
          {error}
        </div>
      )}
      <div className="flex gap-3">
        <button type="submit" disabled={busy} className="nm-btn-solid text-[13px]">{busy ? '送出中…' : '新增'}</button>
        <button type="button" onClick={() => setOpen(false)} className="nm-btn text-[13px]">取消</button>
      </div>
    </form>
  );
}
