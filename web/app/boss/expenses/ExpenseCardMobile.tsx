'use client';

import { useState, useTransition } from 'react';
import { confirmExpense, rejectExpense } from './[id]/actions';

export type MobileCard = {
  id: string;
  user_name: string;
  amount_twd: number | null;
  spent_on: string | null;
  category_label: string;
  site_name: string | null;
  item_text: string | null;
  thumb_url: string | null;
};

export default function ExpenseCardMobile({ row }: { row: MobileCard }) {
  const [pending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  function doConfirm() {
    setError(null);
    startTransition(async () => {
      const r = await confirmExpense(row.id);
      if (!r.ok) setError(r.error ?? '失敗');
    });
  }

  function doReject() {
    setError(null);
    const r = reason.trim();
    if (r.length < 2) {
      setError('請填退回原因(至少 2 字)');
      return;
    }
    startTransition(async () => {
      const res = await rejectExpense(row.id, reason);
      if (!res.ok) setError(res.error ?? '失敗');
      else {
        setRejecting(false);
        setReason('');
      }
    });
  }

  const amount =
    row.amount_twd != null ? `$${row.amount_twd.toLocaleString('zh-TW')}` : '—';
  const dateShort = row.spent_on ? row.spent_on.slice(5).replace('-', '/') : '—';
  const metaParts = [dateShort, row.category_label, row.site_name].filter(Boolean);

  return (
    <div className="nm-raised rounded-[20px] p-4 flex flex-col gap-3.5">
      <div className="flex gap-3.5">
        <div
          className="w-[76px] h-[76px] rounded-xl overflow-hidden shrink-0 nm-inset"
        >
          {row.thumb_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={row.thumb_url}
              alt="收據"
              className="w-full h-full object-cover"
              style={{ filter: 'grayscale(0.4) brightness(0.9)' }}
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-[10px]"
              style={{ color: 'var(--nm-text-faint)' }}
            >
              無收據
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[15px] font-semibold truncate" style={{ color: 'var(--nm-text-primary)' }}>
              {row.user_name}
            </span>
            <span
              className="text-[22px] font-semibold tabular-nums whitespace-nowrap"
              style={{ color: 'var(--nm-text-body)' }}
            >
              {amount}
            </span>
          </div>
          <div className="text-[12.5px] mt-1 leading-relaxed" style={{ color: 'var(--nm-text-secondary)' }}>
            {metaParts.join(' · ') || '—'}
          </div>
          {row.item_text ? (
            <div className="text-[13px] mt-1" style={{ color: '#b8b8bb' }}>
              {row.item_text}
            </div>
          ) : null}
        </div>
      </div>

      {rejecting ? (
        <div className="flex flex-col gap-2">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="退回原因 (員工會看到)"
            rows={2}
            className="nm-input text-[13px]"
          />
          {error ? (
            <span className="text-xs" style={{ color: 'var(--nm-danger)' }}>
              {error}
            </span>
          ) : null}
          <div className="flex gap-2.5">
            <button
              onClick={doReject}
              disabled={pending}
              className="nm-danger flex-1 disabled:opacity-50"
              style={{ height: 46, borderRadius: 13, fontSize: 15, fontWeight: 500, minHeight: 0, padding: 0 }}
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
              className="nm-btn flex-1"
              style={{ height: 46, borderRadius: 13, fontSize: 15, minHeight: 0, padding: 0 }}
            >
              取消
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex gap-2.5">
            <button
              onClick={doConfirm}
              disabled={pending}
              className="nm-success-btn disabled:opacity-50"
              style={{ flex: 2, height: 46, borderRadius: 13, fontSize: 15, fontWeight: 600, minHeight: 0, padding: 0 }}
            >
              確認
            </button>
            <button
              onClick={() => setRejecting(true)}
              disabled={pending}
              className="nm-danger"
              style={{ flex: 1, height: 46, borderRadius: 13, fontSize: 15, minHeight: 0, padding: 0 }}
            >
              退回
            </button>
          </div>
          {error ? (
            <span className="text-xs" style={{ color: 'var(--nm-danger)' }}>
              {error}
            </span>
          ) : null}
        </>
      )}
    </div>
  );
}
