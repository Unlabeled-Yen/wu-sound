'use client';

import { useState } from 'react';

/**
 * 產生 LINE 綁定碼的卡片,staff/settings 和 boss/more 共用。
 * 綁定碼 10 分鐘內有效,使用者加 bot 好友後傳「綁定 XXXXXX」完成綁定。
 */
export function LineBindCard() {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/line/bind-code', { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error ?? '產生綁定碼失敗');
        return;
      }
      setCode(j.code);
    } catch {
      setError('網路錯誤');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="nm-raised rounded-2xl p-4 space-y-3">
      <h2 className="text-[15px] font-semibold" style={{ color: 'var(--nm-text-primary)' }}>
        LINE 綁定
      </h2>
      <p className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>
        綁定後可以直接在 LINE 打卡、傳收據照片、收通知。加「聲生製作」為好友後,傳送這組綁定碼給它。
      </p>

      {code ? (
        <div className="nm-inset rounded-xl p-4 text-center space-y-1">
          <div className="text-2xl font-semibold tabular tracking-widest" style={{ color: 'var(--nm-text-primary)' }}>
            {code}
          </div>
          <div className="text-xs" style={{ color: 'var(--nm-text-muted)' }}>
            10 分鐘內有效,在 LINE 傳「綁定 {code}」給機器人
          </div>
        </div>
      ) : (
        <button type="button" onClick={generate} disabled={busy} className="nm-btn-solid text-sm disabled:opacity-50">
          {busy ? '產生中…' : '產生綁定碼'}
        </button>
      )}

      {error && (
        <p className="text-[13px]" style={{ color: 'var(--nm-danger)' }}>
          {error}
        </p>
      )}
    </section>
  );
}
