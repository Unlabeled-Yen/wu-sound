'use client';

import { useEffect, useState } from 'react';
import type { BundleTemplate } from '@/lib/types';

export default function NewQuoteForm() {
  const [clientName, setClientName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [bundleId, setBundleId] = useState('');
  const [bundles, setBundles] = useState<BundleTemplate[]>([]);
  const [bundlesError, setBundlesError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/bundles');
        const j = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) { setBundlesError(j.error ?? '套組載入失敗'); return; }
        setBundles((j.bundles ?? []) as BundleTemplate[]);
      } catch {
        if (!cancelled) setBundlesError('套組載入失敗');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const selectedBundle = bundles.find((b) => b.id === bundleId) ?? null;

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
        body: JSON.stringify({
          client_name: clientName.trim(),
          project_name: projectName.trim() || null,
          bundle_id: bundleId || null,
        }),
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
      <div>
        <label className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>從標配套組開始(選填)</label>
        <select value={bundleId} onChange={(e) => setBundleId(e.target.value)} className={inputCls}>
          <option value="">不使用套組(從空白開始)</option>
          {bundles.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}{b.applicable_to ? ` · 適用:${b.applicable_to}` : ''}
            </option>
          ))}
        </select>
        {bundlesError && (
          <div className="text-[12px] mt-1" style={{ color: 'var(--nm-danger)' }}>{bundlesError}</div>
        )}
        {selectedBundle && (
          <div className="rounded-xl nm-inset px-3 py-2 mt-2 text-[12px]" style={{ color: 'var(--nm-text-secondary)' }}>
            <div>已選:{selectedBundle.name}</div>
            {selectedBundle.applicable_to && <div>適用:{selectedBundle.applicable_to}</div>}
            {selectedBundle.note && <div style={{ color: 'var(--nm-text-muted)' }}>備註:{selectedBundle.note}</div>}
            <div style={{ color: 'var(--nm-text-muted)' }}>建立後會依此套組展開明細,單價會抓價目表當下售價。</div>
          </div>
        )}
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
