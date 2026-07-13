'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export default function LockButton({ month, disabled }: { month: string; disabled: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function doLock() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/boss/close', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ month }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || '鎖定失敗');
        }
        setConfirming(false);
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <>
      <button
        onClick={() => setConfirming(true)}
        disabled={disabled || pending}
        className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
      >
        鎖定月結
      </button>
      {confirming ? (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4">
          <div className="max-w-sm w-full bg-white dark:bg-neutral-900 rounded-2xl p-5 flex flex-col gap-3">
            <h2 className="text-lg font-semibold">確定鎖定 {month} 月結?</h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              鎖定後所有已確認代墊會標記為「已入帳」,無法再改。
            </p>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => {
                  setConfirming(false);
                  setError(null);
                }}
                disabled={pending}
                className="flex-1 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 text-sm"
              >
                取消
              </button>
              <button
                onClick={doLock}
                disabled={pending}
                className="flex-1 py-2 rounded-xl bg-red-600 text-white text-sm font-medium disabled:opacity-50"
              >
                {pending ? '鎖定中…' : '確定鎖定'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
