'use client';

import { useState } from 'react';

export default function NewQuoteForm() {
  const [clientName, setClientName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputCls = 'nm-input';

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!clientName.trim()) { setError('請填客戶名稱'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_name: clientName.trim(), project_name: projectName.trim() || null }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.quote) { setError(j.error ?? '建立失敗'); setBusy(false); return; }
      window.location.href = `/boss/quotes/${j.quote.id}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : '網路錯誤');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-w-lg">
      <div>
        <label className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>客戶名稱 *</label>
        <input value={clientName} onChange={(e) => setClientName(e.target.value)} className={inputCls} required />
      </div>
      <div>
        <label className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>案件名稱</label>
        <input value={projectName} onChange={(e) => setProjectName(e.target.value)} className={inputCls} placeholder="選填,例:主堂音響更新" />
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
          {busy ? '建立中…' : '建立並開始編輯'}
        </button>
        <a href="/boss/quotes" className="nm-btn text-[13px]">取消</a>
      </div>
    </form>
  );
}
