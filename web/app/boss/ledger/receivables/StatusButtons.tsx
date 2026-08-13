'use client';

import { useState } from 'react';
import type { ReceivableStatus } from '@/lib/types';

export default function StatusButtons({ id, status }: { id: string; status: ReceivableStatus }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(next: ReceivableStatus) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/receivables/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || '更新失敗');
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : '更新失敗');
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {status === 'open' && (
        <>
          <button type="button" disabled={busy} onClick={() => setStatus('closed')} className="nm-btn text-xs" style={{ padding: '3px 10px', minHeight: 'auto' }}>
            結清
          </button>
          <button type="button" disabled={busy} onClick={() => setStatus('voided')} className="nm-btn text-xs" style={{ padding: '3px 10px', minHeight: 'auto' }}>
            作廢
          </button>
        </>
      )}
      {status === 'closed' && (
        <button type="button" disabled={busy} onClick={() => setStatus('open')} className="nm-btn text-xs" style={{ padding: '3px 10px', minHeight: 'auto' }}>
          重新開啟
        </button>
      )}
      {error && <span className="text-xs" style={{ color: 'var(--nm-danger)' }}>{error}</span>}
    </div>
  );
}
