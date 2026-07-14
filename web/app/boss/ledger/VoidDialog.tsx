'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { voidEntry } from './actions';
import { useToast } from '../_shell/Toast';

type Props = {
  id: string;
  summary: string;
};

export function VoidDialog({ id, summary }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'reason' | 'confirm'>('reason');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { success, error: toastError } = useToast();

  const close = () => {
    if (pending) return;
    setOpen(false);
    setStep('reason');
    setReason('');
    setErr(null);
  };

  const goConfirm = () => {
    setErr(null);
    if (reason.trim().length < 2) {
      setErr('請填寫作廢原因(至少 2 字)');
      return;
    }
    setStep('confirm');
  };

  const submit = () => {
    setErr(null);
    start(async () => {
      const res = await voidEntry(id, reason);
      if (!res.ok) {
        const msg = res.error ?? '作廢失敗';
        setErr(msg);
        setStep('reason');
        toastError(msg);
        return;
      }
      close();
      router.refresh();
      success('已作廢一筆帳目');
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="nm-focus text-[13px] underline underline-offset-2"
        style={{ color: 'var(--nm-danger)' }}
      >
        作廢
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm"
          style={{ background: 'rgba(0,0,0,0.55)' }}
          onClick={close}
        >
          <div
            className="w-full max-w-md rounded-[24px] nm-raised-lg p-6"
            style={{ color: 'var(--nm-text-primary)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {step === 'reason' && (
              <>
                <div className="text-lg font-semibold">作廢這筆帳目</div>
                <div className="mt-1 text-[13px] truncate" style={{ color: 'var(--nm-text-secondary)' }}>
                  {summary}
                </div>
                <label className="block mt-4 text-[13px] font-medium" style={{ color: 'var(--nm-text-secondary)' }}>
                  作廢原因 <span style={{ color: 'var(--nm-danger)' }}>*</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  placeholder="例如:重複輸入、金額打錯、對象記錯…"
                  className="nm-input mt-2 text-[13px] resize-none"
                  autoFocus
                />
                {err && (
                  <div className="mt-2 text-[13px]" style={{ color: 'var(--nm-danger)' }}>{err}</div>
                )}
                <div className="mt-5 flex justify-end gap-3">
                  <button type="button" onClick={close} className="nm-btn nm-focus text-[13px]">
                    取消
                  </button>
                  <button type="button" onClick={goConfirm} className="nm-danger nm-focus text-[13px]">
                    下一步
                  </button>
                </div>
              </>
            )}

            {step === 'confirm' && (
              <>
                <div className="text-lg font-semibold" style={{ color: 'var(--nm-danger)' }}>
                  確定要作廢?
                </div>
                <div className="mt-1 text-[13px] truncate" style={{ color: 'var(--nm-text-secondary)' }}>
                  {summary}
                </div>
                <div className="mt-4 rounded-xl nm-inset p-4 text-[13px]">
                  <div
                    className="text-[11px] uppercase tracking-wider mb-1"
                    style={{ color: 'var(--nm-text-muted)' }}
                  >
                    作廢原因
                  </div>
                  {reason}
                </div>
                <div className="mt-3 text-xs" style={{ color: 'var(--nm-text-muted)' }}>
                  作廢後不會刪除紀錄,但會在報表中被排除,且會留下稽核軌跡。
                </div>
                {err && (
                  <div className="mt-2 text-[13px]" style={{ color: 'var(--nm-danger)' }}>{err}</div>
                )}
                <div className="mt-5 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setStep('reason')}
                    disabled={pending}
                    className="nm-btn nm-focus text-[13px]"
                  >
                    返回修改
                  </button>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={pending}
                    className="nm-danger nm-focus text-[13px]"
                  >
                    {pending ? '作廢中…' : '確定作廢'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
