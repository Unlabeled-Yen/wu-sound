'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ClockinEntry({
  id,
  type,
  ts,
  isBackfill,
  backfillReason,
}: {
  id: string;
  type: 'in' | 'out';
  ts: string;
  isBackfill: boolean;
  backfillReason: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const d = new Date(ts);
  const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const [editType, setEditType] = useState<'in' | 'out'>(type);
  const [editTime, setEditTime] = useState(timeStr);

  async function save() {
    setError(null);
    setBusy(true);
    try {
      const [h, min] = editTime.split(':').map((x) => parseInt(x, 10));
      const newTs = new Date(d);
      newTs.setHours(h, min, 0, 0);
      const res = await fetch(`/api/clockins/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: editType, ts: newTs.toISOString() }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error ?? '儲存失敗'); setBusy(false); return; }
      setEditing(false);
      setBusy(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '網路錯誤');
      setBusy(false);
    }
  }

  async function del() {
    if (!window.confirm('確定要刪除這筆打卡紀錄嗎?')) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/clockins/${id}`, { method: 'DELETE' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error ?? '刪除失敗'); setBusy(false); return; }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '網路錯誤');
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="flex flex-col items-center gap-1 whitespace-nowrap">
        <select
          value={editType}
          onChange={(e) => setEditType(e.target.value as 'in' | 'out')}
          className="nm-input text-[11px]"
          style={{ minHeight: 22, padding: '0 4px' }}
        >
          <option value="in">入</option>
          <option value="out">出</option>
        </select>
        <input
          type="time"
          value={editTime}
          onChange={(e) => setEditTime(e.target.value)}
          className="nm-input text-[11px]"
          style={{ minHeight: 22, padding: '0 4px' }}
        />
        <div className="flex gap-2">
          <button onClick={save} disabled={busy} className="text-[11px] nm-focus disabled:opacity-50" style={{ color: 'var(--nm-success)' }}>
            {busy ? '存…' : '存'}
          </button>
          <button onClick={del} disabled={busy} className="text-[11px] nm-focus disabled:opacity-50" style={{ color: 'var(--nm-danger)' }}>
            刪
          </button>
          <button onClick={() => { setEditing(false); setError(null); }} className="text-[11px] nm-focus" style={{ color: 'var(--nm-text-muted)' }}>
            取消
          </button>
        </div>
        {error && <span className="text-[10px]" style={{ color: 'var(--nm-danger)' }}>{error}</span>}
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="flex items-center justify-center gap-1 nm-focus"
      title={isBackfill ? backfillReason || '補登' : '點擊編輯'}
    >
      <span style={{ color: type === 'in' ? 'var(--nm-success-glass-text)' : 'var(--nm-warning-glass-text)' }}>
        {type === 'in' ? '入' : '出'} {timeStr}
      </span>
      {isBackfill && (
        <span className="nm-pill nm-pill-warning" style={{ padding: '1px 6px', fontSize: 11 }}>
          補
        </span>
      )}
    </button>
  );
}
