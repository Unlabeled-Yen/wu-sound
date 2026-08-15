'use client';

import { useState } from 'react';

// 有人有獎金/代墊但沒有設定月薪時,不能默默跳過那個人的薪資分錄——
// 跳出跟其他「防呆二次確認」(StatusButtons/VoidDialog)同風格的攔截,
// 列出被跳過的名字,老闆按「仍要鎖定」才會真的送出。
export default function LockPayrollButton({ month, disabled, skippedNames }: {
  month: string;
  disabled: boolean;
  skippedNames: string[];
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ salary: number; bonus: number; reimbursement: number } | null>(null);

  async function doLock() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/payroll/lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || '鎖定失敗');
      setResult(j.written);
      setConfirmOpen(false);
      setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      setError(e instanceof Error ? e.message : '鎖定失敗');
      setBusy(false);
    }
  }

  function onClick() {
    if (skippedNames.length > 0) { setConfirmOpen(true); return; }
    void doLock();
  }

  return (
    <div className="flex flex-col gap-2 items-start">
      <button type="button" disabled={disabled || busy} onClick={onClick} className="nm-btn-solid text-[13px]">
        {busy ? '鎖定中…' : '鎖定並寫入帳務'}
      </button>
      {error && <span className="text-xs" style={{ color: 'var(--nm-danger)' }}>{error}</span>}
      {result && (
        <span className="text-xs" style={{ color: 'var(--nm-success-glass-text)' }}>
          已寫入:薪資 {result.salary} 筆・獎金 {result.bonus} 筆・代墊 {result.reimbursement} 筆
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
              有人沒有設定月薪,確定要鎖定?
            </div>
            <div className="mt-3 text-[13px] leading-[1.8]" style={{ color: 'var(--nm-text-secondary)' }}>
              {skippedNames.join('、')} 有獎金或代墊要入帳,但沒有設定月薪——這次鎖定不會幫他們寫薪資分錄。
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => setConfirmOpen(false)} disabled={busy} className="nm-btn text-[13px]">
                取消
              </button>
              <button
                type="button"
                onClick={() => void doLock()}
                disabled={busy}
                className="nm-btn text-[13px]"
                style={{ color: 'var(--nm-warning-glass-text)', borderColor: 'rgba(217,181,107,.4)' }}
              >
                {busy ? '處理中…' : '仍要鎖定'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
