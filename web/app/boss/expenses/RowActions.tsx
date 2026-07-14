'use client';

import { useState, useTransition } from 'react';
import { confirmExpense, rejectExpense } from './[id]/actions';

export default function RowActions({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  function doConfirm() {
    setError(null);
    startTransition(async () => {
      const r = await confirmExpense(id);
      if (!r.ok) setError(r.error ?? '失敗');
    });
  }

  function doReject() {
    setError(null);
    if (!reason.trim()) {
      setError('請填退回原因');
      return;
    }
    startTransition(async () => {
      const r = await rejectExpense(id, reason);
      if (!r.ok) setError(r.error ?? '失敗');
      else {
        setRejecting(false);
        setReason('');
      }
    });
  }

  if (rejecting) {
    return (
      <div className="flex flex-col gap-2 min-w-[220px]">
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="退回原因 (員工會看到)"
          rows={2}
          className="w-full nm-input text-[13px]"
        />
        {error ? <span className="text-xs" style={{ color: 'var(--nm-danger)' }}>{error}</span> : null}
        <div className="flex gap-2">
          <button
            onClick={doReject}
            disabled={pending}
            className="nm-danger text-[13px] disabled:opacity-50"
            style={{ padding: '4px 12px', minHeight: 'auto' }}
          >
            確定退回
          </button>
          <button
            onClick={() => {
              setRejecting(false);
              setReason('');
              setError(null);
            }}
            disabled={pending}
            className="nm-btn text-[13px]"
            style={{ padding: '4px 12px', minHeight: 'auto' }}
          >
            取消
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 min-w-[100px]">
      <div className="flex gap-2">
        <button
          onClick={doConfirm}
          disabled={pending}
          className="nm-success-btn text-[13px] disabled:opacity-50"
          style={{ padding: '4px 12px', minHeight: 'auto' }}
        >
          確認
        </button>
        <button
          onClick={() => setRejecting(true)}
          disabled={pending}
          className="nm-danger text-[13px]"
          style={{ padding: '4px 12px', minHeight: 'auto' }}
        >
          退回
        </button>
      </div>
      {error ? <span className="text-xs" style={{ color: 'var(--nm-danger)' }}>{error}</span> : null}
    </div>
  );
}
