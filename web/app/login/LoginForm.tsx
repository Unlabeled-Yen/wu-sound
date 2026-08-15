'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { UserRole } from '@/lib/types';

interface ActiveUser {
  id: string;
  name: string;
  role: UserRole;
}

interface Props {
  users: ActiveUser[];
}

export default function LoginForm({ users }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<ActiveUser | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function tryLogin(fullPin: string, user: ActiveUser) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: user.name, pin: fullPin }),
      });
      if (res.status === 401) {
        setError('PIN 錯誤,請重試');
        setPin('');
        setSubmitting(false);
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error || '登入失敗,請稍後再試');
        setPin('');
        setSubmitting(false);
        return;
      }
      const body = (await res.json()) as { ok: boolean; role: UserRole };
      router.replace(body.role === 'boss' ? '/boss' : '/staff');
      router.refresh();
    } catch {
      setError('網路連線失敗,請稍後再試');
      setPin('');
      setSubmitting(false);
    }
  }

  function handleDigit(d: string) {
    if (!selected || submitting) return;
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    setError(null);
    if (next.length === 4) {
      void tryLogin(next, selected);
    }
  }

  function handleBackspace() {
    if (submitting) return;
    setPin((p) => p.slice(0, -1));
    setError(null);
  }

  if (!selected) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[13px] leading-[1.6] text-center mb-2" style={{ color: 'var(--nm-text-secondary)' }}>
          請選擇你的名字
        </p>
        {users.length === 0 ? (
          <p className="text-center text-[13px] leading-[1.6]" style={{ color: 'var(--nm-text-secondary)' }}>尚無啟用中的使用者</p>
        ) : (
          users.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => setSelected(u)}
              className="w-full min-h-[64px] rounded-2xl nm-raised nm-lift nm-focus text-lg font-medium active:scale-[0.99] transition"
              style={{ color: 'var(--nm-text-primary)' }}
            >
              {u.name}
              <span className="ml-2 text-[11px] leading-none tracking-[.14em]" style={{ color: 'var(--nm-text-muted)' }}>
                {u.role === 'boss' ? '老闆' : '員工'}
              </span>
            </button>
          ))
        )}
      </div>
    );
  }

  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            setSelected(null);
            setPin('');
            setError(null);
          }}
          className="text-[13px] leading-[1.6] underline nm-focus"
          style={{ color: 'var(--nm-text-secondary)' }}
        >
          ← 換人
        </button>
        <span className="text-base font-medium" style={{ color: 'var(--nm-text-primary)' }}>{selected.name}</span>
      </div>

      <p className="text-center text-[13px] leading-[1.6]" style={{ color: 'var(--nm-text-secondary)' }}>
        請輸入 4 位數 PIN
      </p>

      <div className="flex justify-center gap-3 my-2" aria-label="PIN 顯示">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="w-12 h-12 rounded-xl border flex items-center justify-center text-2xl"
            style={{
              borderColor: pin.length > i ? 'var(--nm-accent)' : 'var(--nm-border-glass)',
              background: pin.length > i ? 'var(--nm-accent)' : 'transparent',
            }}
          >
            {pin.length > i ? (
              <span className="w-3 h-3 rounded-full" style={{ background: 'var(--nm-bg-deep)' }} />
            ) : null}
          </div>
        ))}
      </div>

      {error ? (
        <p className="text-center text-[13px] leading-[1.6]" style={{ color: 'var(--nm-danger)' }} role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-3 gap-3">
        {digits.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => handleDigit(d)}
            disabled={submitting}
            className="min-h-[64px] nm-btn text-2xl font-medium active:scale-[0.97] transition"
          >
            {d}
          </button>
        ))}
        <div />
        <button
          type="button"
          onClick={() => handleDigit('0')}
          disabled={submitting}
          className="min-h-[64px] nm-btn text-2xl font-medium active:scale-[0.97] transition"
        >
          0
        </button>
        <button
          type="button"
          onClick={handleBackspace}
          disabled={submitting || pin.length === 0}
          className="min-h-[64px] nm-btn text-base font-medium active:scale-[0.97] transition"
          aria-label="刪除一位"
        >
          ⌫
        </button>
      </div>

      {submitting ? (
        <p className="text-center text-[13px] leading-[1.6]" style={{ color: 'var(--nm-text-muted)' }}>登入中…</p>
      ) : null}
    </div>
  );
}
