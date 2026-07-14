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
        className="nm-danger text-[13px]"
      >
        鎖定月結
      </button>
      {confirming ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-w-sm w-full rounded-2xl nm-raised-lg p-5 flex flex-col gap-3" style={{ background: 'rgba(24,24,28,0.75)' }}>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--nm-text-primary)' }}>確定鎖定 {month} 月結?</h2>
            <p className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>
              鎖定後所有已確認代墊會標記為「已入帳」,無法再改。
            </p>
            {error ? <p className="text-[13px]" style={{ color: 'var(--nm-danger)' }}>{error}</p> : null}
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => {
                  setConfirming(false);
                  setError(null);
                }}
                disabled={pending}
                className="flex-1 nm-btn text-[13px]"
              >
                取消
              </button>
              <button
                onClick={doLock}
                disabled={pending}
                className="flex-1 nm-danger text-[13px]"
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
