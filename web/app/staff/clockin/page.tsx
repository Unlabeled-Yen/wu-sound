'use client';

import { useEffect, useState } from 'react';

interface Clockin {
  id: string;
  ts: string;
  type: 'in' | 'out';
  is_backfill: boolean;
  backfill_reason: string | null;
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function localDateKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function StaffClockinPage() {
  const [all, setAll] = useState<Clockin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [posting, setPosting] = useState<'in' | 'out' | null>(null);
  const [showBackfill, setShowBackfill] = useState(false);

  const [bfTs, setBfTs] = useState('');
  const [bfType, setBfType] = useState<'in' | 'out'>('in');
  const [bfReason, setBfReason] = useState('');
  const [bfError, setBfError] = useState<string | null>(null);
  const [bfSubmitting, setBfSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/clockins', { cache: 'no-store' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || '讀取打卡失敗');
      setAll(j.clockins || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '讀取失敗');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const today = todayKey();
  const todayList = all
    .filter((c) => localDateKey(c.ts) === today)
    .sort((a, b) => a.ts.localeCompare(b.ts));

  async function clockNow(type: 'in' | 'out') {
    setError(null);
    setPosting(type);
    try {
      const res = await fetch('/api/clockins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || '打卡失敗');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '打卡失敗');
    } finally {
      setPosting(null);
    }
  }

  async function submitBackfill(e: React.FormEvent) {
    e.preventDefault();
    setBfError(null);
    if (!bfTs) {
      setBfError('請選擇補打卡時間');
      return;
    }
    if (!bfReason.trim()) {
      setBfError('請填寫補打卡原因');
      return;
    }
    setBfSubmitting(true);
    try {
      const res = await fetch('/api/clockins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: bfType,
          ts: new Date(bfTs).toISOString(),
          backfill_reason: bfReason.trim(),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || '補打卡失敗');
      setBfTs('');
      setBfReason('');
      setBfType('in');
      setShowBackfill(false);
      await load();
    } catch (e) {
      setBfError(e instanceof Error ? e.message : '補打卡失敗');
    } finally {
      setBfSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold" style={{ color: 'var(--nm-text-primary)' }}>打卡</h1>
        <p className="text-[13px] mt-0.5" style={{ color: 'var(--nm-text-muted)' }}>
          {new Date().toLocaleDateString('zh-TW')}
        </p>
      </header>

      {error && (
        <div className="nm-inset rounded-xl p-3 text-[13px]" style={{ color: 'var(--nm-danger)' }}>
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => clockNow('in')}
          disabled={posting !== null}
          className="flex flex-col items-center justify-center gap-1.5 rounded-[22px] h-32 active:scale-[0.97] transition disabled:opacity-60 nm-focus"
          style={{
            background: 'rgba(126,207,157,0.14)',
            border: '1px solid rgba(126,207,157,0.35)',
            color: 'var(--nm-success-glass-text)',
          }}
        >
          <ClockInIcon />
          <span className="text-[21px] font-semibold">{posting === 'in' ? '記錄中…' : '上班'}</span>
        </button>
        <button
          type="button"
          onClick={() => clockNow('out')}
          disabled={posting !== null}
          className="flex flex-col items-center justify-center gap-1.5 rounded-[22px] h-32 active:scale-[0.97] transition disabled:opacity-60 nm-focus"
          style={{
            background: 'rgba(217,181,107,0.14)',
            border: '1px solid rgba(217,181,107,0.35)',
            color: 'var(--nm-warning-glass-text)',
          }}
        >
          <ClockOutIcon />
          <span className="text-[21px] font-semibold">{posting === 'out' ? '記錄中…' : '下班'}</span>
        </button>
      </div>

      <section className="space-y-2">
        <h2 className="text-xs uppercase tracking-wide" style={{ color: 'var(--nm-text-muted)' }}>
          今日打卡
        </h2>
        {loading ? (
          <p className="text-[13px]" style={{ color: 'var(--nm-text-muted)' }}>載入中…</p>
        ) : todayList.length === 0 ? (
          <p className="text-[13px]" style={{ color: 'var(--nm-text-muted)' }}>今天還沒有打卡記錄</p>
        ) : (
          <ul className="nm-raised rounded-2xl divide-y overflow-hidden" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
            {todayList.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-3 px-4 py-3"
                style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: c.type === 'in' ? 'var(--nm-success)' : 'var(--nm-warning)' }}
                />
                <span className="text-[14px] font-medium flex-1" style={{ color: 'var(--nm-text-body)' }}>
                  {c.type === 'in' ? '上班' : '下班'}
                </span>
                <span className="tabular text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>
                  {new Date(c.ts).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
                </span>
                {c.is_backfill && <span className="nm-pill nm-pill-warning">補</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="text-center">
        <button
          type="button"
          onClick={() => setShowBackfill((v) => !v)}
          className="text-[13px] underline underline-offset-2 nm-focus rounded px-2 py-1"
          style={{ color: 'var(--nm-text-muted)' }}
        >
          補打卡
        </button>
      </div>

      {showBackfill && (
        <form onSubmit={submitBackfill} className="nm-raised rounded-2xl p-4 space-y-3">
          <h3 className="text-[15px] font-semibold" style={{ color: 'var(--nm-text-primary)' }}>補打卡</h3>
          {bfError && (
            <div className="nm-inset rounded-xl p-3 text-[13px]" style={{ color: 'var(--nm-danger)' }}>
              {bfError}
            </div>
          )}
          <label className="block text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>
            <span className="mb-1.5 block font-medium">類型</span>
            <div className="flex gap-4">
              <label className="flex items-center gap-1.5">
                <input type="radio" name="bfType" value="in" checked={bfType === 'in'} onChange={() => setBfType('in')} />
                上班
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" name="bfType" value="out" checked={bfType === 'out'} onChange={() => setBfType('out')} />
                下班
              </label>
            </div>
          </label>
          <label className="block text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>
            <span className="mb-1.5 block font-medium">補打卡時間</span>
            <input
              type="datetime-local"
              value={bfTs}
              onChange={(e) => setBfTs(e.target.value)}
              className="nm-input"
              required
            />
          </label>
          <label className="block text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>
            <span className="mb-1.5 block font-medium">原因</span>
            <textarea
              value={bfReason}
              onChange={(e) => setBfReason(e.target.value)}
              rows={2}
              className="nm-input"
              placeholder="為什麼要補打卡"
              required
            />
          </label>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowBackfill(false)}
              disabled={bfSubmitting}
              className="flex-1 nm-btn text-[13px] nm-focus"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={bfSubmitting}
              className="flex-[2] nm-btn-solid text-[13px] nm-focus"
            >
              {bfSubmitting ? '送出中…' : '送出補打卡'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function ClockInIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
function ClockOutIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M9 12h6" />
    </svg>
  );
}
