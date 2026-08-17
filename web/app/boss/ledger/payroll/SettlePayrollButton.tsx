'use client';

import { useState } from 'react';

// 送出結算=第一次按建立這個月的處理中心並寫入分錄,之後按=重新比對現況、
// 同步差異(改過的獎金/月薪/新併入的代墊都會反映)。沒有「鎖定」這回事。
export default function SettlePayrollButton({ month, settled, disabled, skippedNames }: {
  month: string;
  settled: boolean;
  disabled: boolean;
  skippedNames: string[];
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ inserted: number; updated: number; voided: number } | null>(null);

  async function doSettle() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/payroll/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || '結算失敗');
      setResult({ inserted: j.inserted, updated: j.updated, voided: j.voided });
      setConfirmOpen(false);
      setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      setError(e instanceof Error ? e.message : '結算失敗');
      setBusy(false);
    }
  }

  function onClick() {
    if (skippedNames.length > 0) { setConfirmOpen(true); return; }
    void doSettle();
  }

  return (
    <div className="flex flex-col gap-2 items-start">
      <button type="button" disabled={disabled || busy} onClick={onClick} className="nm-btn-solid text-[13px]">
        {busy ? '結算中…' : settled ? '更新結算' : '送出結算'}
      </button>
      {error && <span className="text-xs" style={{ color: 'var(--nm-danger)' }}>{error}</span>}
      {result && (
        <span className="text-xs" style={{ color: 'var(--nm-success-glass-text)' }}>
          已同步:新增 {result.inserted} 筆・更新 {result.updated} 筆・作廢 {result.voided} 筆
        </span>
      )}

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
              有人沒有設定月薪,確定要送出?
            </div>
            <div className="mt-3 text-[13px] leading-[1.8]" style={{ color: 'var(--nm-text-secondary)' }}>
              {skippedNames.join('、')} 有獎金或代墊要入帳,但沒有設定月薪——這次結算不會幫他們寫薪資分錄。
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => setConfirmOpen(false)} disabled={busy} className="nm-btn text-[13px]">
                取消
              </button>
              <button
                type="button"
                onClick={() => void doSettle()}
                disabled={busy}
                className="nm-btn text-[13px]"
                style={{ color: 'var(--nm-warning-glass-text)', borderColor: 'rgba(217,181,107,.4)' }}
              >
                {busy ? '處理中…' : '仍要送出'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
