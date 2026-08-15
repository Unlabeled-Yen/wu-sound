'use client';

import { useState } from 'react';

// 獎金是人為決定的金額(視案件/加班),系統只記錄不計算——鎖定前可以隨時改,
// 鎖定後(locked=true)這顆按鈕整個不會被渲染(見 PayrollView),不是靠 disabled 擋。
export default function BonusButton({ userId, month, currentAmount, currentMemo }: {
  userId: string;
  month: string;
  currentAmount: number;
  currentMemo: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(currentAmount ? String(currentAmount) : '');
  const [memo, setMemo] = useState(currentMemo ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    setError(null);
    const value = amount.trim() === '' ? 0 : Number(amount);
    if (!Number.isInteger(value) || value < 0) { setError('獎金必須為非負整數'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/payroll/bonus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, month, amount_twd: value, memo: memo.trim() || null }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || '儲存失敗');
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : '儲存失敗');
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} className="nm-btn text-xs" style={{ padding: '3px 10px', minHeight: 'auto' }}>
        {currentAmount > 0 ? '編輯獎金' : '加獎金'}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 items-start">
      <div className="flex items-center gap-1.5">
        <input
          type="number" inputMode="numeric" min={0} step={1}
          value={amount} onChange={(e) => setAmount(e.target.value)} disabled={busy}
          placeholder="金額(留空=0)"
          className="nm-input text-xs" style={{ padding: '3px 6px', minHeight: 'auto', width: 100 }}
        />
        <input
          type="text" value={memo} onChange={(e) => setMemo(e.target.value)} disabled={busy}
          placeholder="備註(例:恩光堂案獎金)"
          className="nm-input text-xs" style={{ padding: '3px 6px', minHeight: 'auto', width: 180 }}
        />
      </div>
      <div className="flex items-center gap-1.5">
        <button type="button" disabled={busy} onClick={onSave} className="nm-btn text-xs" style={{ padding: '3px 10px', minHeight: 'auto' }}>
          {busy ? '儲存中…' : '儲存'}
        </button>
        <button type="button" disabled={busy} onClick={() => { setEditing(false); setError(null); }} className="nm-btn text-xs" style={{ padding: '3px 10px', minHeight: 'auto' }}>
          取消
        </button>
      </div>
      {error && <span className="text-xs" style={{ color: 'var(--nm-danger)' }}>{error}</span>}
    </div>
  );
}
