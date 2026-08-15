'use client';

import { useState } from 'react';

// 只開放編輯約定日期(不含金額/對象/專案)——見 docs 對編輯範圍的決策:
// 已結清/部分結清的約定,金額被改掉會讓帳目對不上,約定日期不影響金額,
// 補登風險低,所以只有這一個欄位可編輯。
export default function EditDueDateButton({ id, agreedDueDate }: { id: string; agreedDueDate: string | null }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(agreedDueDate ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/receivables/${id}/due-date`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agreed_due_date: value || null }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || '更新失敗');
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : '更新失敗');
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} className="nm-btn text-xs" style={{ padding: '3px 10px', minHeight: 'auto' }}>
        編輯日期
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="date"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={busy}
        className="nm-input text-xs"
        style={{ padding: '3px 6px', minHeight: 'auto', width: 140 }}
      />
      <button type="button" disabled={busy} onClick={onSave} className="nm-btn text-xs" style={{ padding: '3px 10px', minHeight: 'auto' }}>
        {busy ? '儲存中…' : '儲存'}
      </button>
      <button type="button" disabled={busy} onClick={() => { setEditing(false); setValue(agreedDueDate ?? ''); setError(null); }} className="nm-btn text-xs" style={{ padding: '3px 10px', minHeight: 'auto' }}>
        取消
      </button>
      {error && <span className="text-xs" style={{ color: 'var(--nm-danger)' }}>{error}</span>}
    </div>
  );
}
