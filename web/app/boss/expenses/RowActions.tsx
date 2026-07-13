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
          className="w-full px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm"
        />
        {error ? <span className="text-xs text-red-600">{error}</span> : null}
        <div className="flex gap-2">
          <button
            onClick={doReject}
            disabled={pending}
            className="px-3 py-1 rounded bg-red-600 text-white text-sm disabled:opacity-50"
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
            className="px-3 py-1 rounded border border-neutral-300 dark:border-neutral-700 text-sm"
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
          className="px-3 py-1 rounded bg-emerald-600 text-white text-sm disabled:opacity-50"
        >
          確認
        </button>
        <button
          onClick={() => setRejecting(true)}
          disabled={pending}
          className="px-3 py-1 rounded border border-red-400 text-red-600 text-sm"
        >
          退回
        </button>
      </div>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
