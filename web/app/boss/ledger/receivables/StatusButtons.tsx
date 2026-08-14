'use client';

import { useState } from 'react';
import type { ReceivableStatus } from '@/lib/types';

const fmt = (n: number) => Math.abs(n).toLocaleString('zh-TW');

// 結清防呆:remaining_twd 不等於 0 時(還沒收滿或超收),不能一按就結清——
// 「結清」目前是純狀態切換,不會自動核對金額(見 app/api/receivables/[id]/status),
// 手滑點掉會讓「已結清」跟「實際收了多少」對不上,且事後很難發現。
// remaining_twd === 0 的正常案例維持原本一鍵結清,不多加摩擦。
export default function StatusButtons({ id, status, remainingTwd = 0, direction = 'receivable' }: {
  id: string;
  status: ReceivableStatus;
  remainingTwd?: number;
  direction?: 'receivable' | 'payable';
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

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

  function onCloseClick() {
    if (remainingTwd !== 0) { setConfirmOpen(true); return; }
    setStatus('closed');
  }

  const unsettledLabel = direction === 'receivable' ? '未收' : '未付';
  const overpaidLabel = direction === 'receivable' ? '超收' : '超付';

  return (
    <div className="flex items-center gap-2">
      {status === 'open' && (
        <>
          <button type="button" disabled={busy} onClick={onCloseClick} className="nm-btn text-xs" style={{ padding: '3px 10px', minHeight: 'auto' }}>
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

      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm"
          style={{ background: 'rgba(0,0,0,0.55)' }}
          onClick={() => !busy && setConfirmOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-[20px] nm-raised-lg p-6"
            style={{ color: 'var(--nm-text-primary)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[15px] font-semibold" style={{ color: 'var(--nm-warning-glass-text)' }}>
              金額還沒對上,確定要結清?
            </div>
            <div className="mt-3 text-[13px] leading-[1.8]" style={{ color: 'var(--nm-text-secondary)' }}>
              {remainingTwd > 0
                ? `這筆約定還有 $${fmt(remainingTwd)} ${unsettledLabel},結清後不會再提醒。`
                : `這筆約定${overpaidLabel} $${fmt(remainingTwd)},結清後不會再提醒。`}
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => setConfirmOpen(false)} disabled={busy} className="nm-btn text-[13px]">
                取消
              </button>
              <button
                type="button"
                onClick={() => { setConfirmOpen(false); setStatus('closed'); }}
                disabled={busy}
                className="nm-btn text-[13px]"
                style={{ color: 'var(--nm-warning-glass-text)', borderColor: 'rgba(217,181,107,.4)' }}
              >
                {busy ? '處理中…' : '仍要結清'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
