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
    <div className="min-h-screen bg-neutral-50 p-4">
      <header className="mb-4">
        <h1 className="text-xl font-bold">打卡</h1>
        <p className="text-sm text-neutral-500">{new Date().toLocaleDateString('zh-TW')}</p>
      </header>

      {error && (
        <div className="mb-3 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => clockNow('in')}
          disabled={posting !== null}
          className="rounded-xl bg-emerald-600 py-8 text-2xl font-bold text-white shadow-md active:bg-emerald-700 disabled:bg-neutral-400"
        >
          {posting === 'in' ? '記錄中…' : '上班'}
        </button>
        <button
          type="button"
          onClick={() => clockNow('out')}
          disabled={posting !== null}
          className="rounded-xl bg-orange-600 py-8 text-2xl font-bold text-white shadow-md active:bg-orange-700 disabled:bg-neutral-400"
        >
          {posting === 'out' ? '記錄中…' : '下班'}
        </button>
      </div>

      <section className="mb-6">
        <h2 className="mb-2 text-base font-semibold">今日打卡</h2>
        {loading ? (
          <p className="text-sm text-neutral-500">載入中…</p>
        ) : todayList.length === 0 ? (
          <p className="text-sm text-neutral-500">今天還沒有打卡記錄</p>
        ) : (
          <ul className="space-y-2">
            {todayList.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded border border-neutral-200 bg-white p-3 text-sm"
              >
                <span className="font-medium">{c.type === 'in' ? '上班' : '下班'}</span>
                <span className="text-neutral-700">
                  {new Date(c.ts).toLocaleTimeString('zh-TW', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                {c.is_backfill && (
                  <span className="rounded bg-orange-100 px-2 py-0.5 text-xs text-orange-800">補</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="text-center">
        <button
          type="button"
          onClick={() => setShowBackfill((v) => !v)}
          className="text-sm text-blue-600 underline"
        >
          補打卡
        </button>
      </div>

      {showBackfill && (
        <form
          onSubmit={submitBackfill}
          className="mt-3 rounded-lg border border-neutral-300 bg-white p-4 shadow-sm"
        >
          <h3 className="mb-3 text-base font-semibold">補打卡</h3>
          {bfError && (
            <div className="mb-3 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
              {bfError}
            </div>
          )}
          <label className="mb-3 block text-sm">
            <span className="mb-1 block font-medium">類型</span>
            <div className="flex gap-4">
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="bfType"
                  value="in"
                  checked={bfType === 'in'}
                  onChange={() => setBfType('in')}
                />
                上班
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="bfType"
                  value="out"
                  checked={bfType === 'out'}
                  onChange={() => setBfType('out')}
                />
                下班
              </label>
            </div>
          </label>
          <label className="mb-3 block text-sm">
            <span className="mb-1 block font-medium">補打卡時間</span>
            <input
              type="datetime-local"
              value={bfTs}
              onChange={(e) => setBfTs(e.target.value)}
              className="w-full rounded border border-neutral-300 p-2"
              required
            />
          </label>
          <label className="mb-3 block text-sm">
            <span className="mb-1 block font-medium">原因</span>
            <textarea
              value={bfReason}
              onChange={(e) => setBfReason(e.target.value)}
              rows={2}
              className="w-full rounded border border-neutral-300 p-2"
              placeholder="為什麼要補打卡"
              required
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowBackfill(false)}
              disabled={bfSubmitting}
              className="flex-1 rounded border border-neutral-300 py-2 text-sm"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={bfSubmitting}
              className="flex-[2] rounded bg-blue-600 py-2 text-sm font-bold text-white disabled:bg-neutral-400"
            >
              {bfSubmitting ? '送出中…' : '送出補打卡'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
