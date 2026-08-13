'use client';

import { useState } from 'react';

export default function NewBundleForm() {
  const [name, setName] = useState('');
  const [applicableTo, setApplicableTo] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputCls = 'nm-input';

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError('請填套組名稱'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/bundles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          applicable_to: applicableTo.trim() || null,
          note: note.trim() || null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.bundle) { setError(j.error ?? '建立失敗'); setBusy(false); return; }
      window.location.href = `/boss/bundles/${j.bundle.id}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : '網路錯誤');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-w-lg">
      <div>
        <label className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>套組名稱 *</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="例:教會主堂-小型基礎" required />
      </div>
      <div>
        <label className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>適用情境</label>
        <input value={applicableTo} onChange={(e) => setApplicableTo(e.target.value)} className={inputCls} placeholder="選填,例:100坪以下教會主堂" />
      </div>
      <div>
        <label className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>備註</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={inputCls} placeholder="選填,例:低頻不足時另加 KW181 x2" />
      </div>
      {error && (
        <div
          className="rounded-xl px-3 py-2 text-[13px]"
          style={{
            background: 'rgba(224, 122, 122, 0.08)',
            border: '1px solid rgba(224, 122, 122, 0.34)',
            color: 'var(--nm-danger-glass-text)',
          }}
        >
          {error}
        </div>
      )}
      <div className="flex gap-3">
        <button type="submit" disabled={busy} className="nm-btn-solid text-[13px] disabled:opacity-50">
          {busy ? '建立中…' : '建立並開始加明細'}
        </button>
        <a href="/boss/bundles" className="nm-btn text-[13px]">取消</a>
      </div>
    </form>
  );
}
