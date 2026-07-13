'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type SheetMode = null | 'fuel' | 'parking';

const QUEUE_KEY = 'ssa.upload.queue.v1';

interface QueuedItem {
  id: string;
  dataUrl: string;
  mediaType: string;
  addedAt: number;
}

function loadQueue(): QueuedItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as QueuedItem[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveQueue(items: QueuedItem[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('讀取檔案失敗'));
    fr.onload = () => resolve(String(fr.result));
    fr.readAsDataURL(file);
  });
}

function dataUrlToBlob(url: string): Blob {
  const [meta, b64] = url.split(',');
  const m = /data:([^;]+);base64/.exec(meta);
  const mime = m ? m[1] : 'image/jpeg';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export default function CapturePage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [queueCount, setQueueCount] = useState(0);
  const [sheet, setSheet] = useState<SheetMode>(null);
  const [amount, setAmount] = useState('');
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [sheetSubmitting, setSheetSubmitting] = useState(false);

  useEffect(() => {
    setQueueCount(loadQueue().length);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  async function flushQueue() {
    const q = loadQueue();
    if (q.length === 0) return;
    const remain: QueuedItem[] = [];
    for (const item of q) {
      try {
        const blob = dataUrlToBlob(item.dataUrl);
        const fd = new FormData();
        fd.append('photo', blob, `${item.id}.jpg`);
        const res = await fetch('/api/expenses/capture', { method: 'POST', body: fd });
        if (!res.ok) remain.push(item);
      } catch {
        remain.push(item);
      }
    }
    saveQueue(remain);
    setQueueCount(remain.length);
    if (remain.length === 0) {
      setToast('離線佇列已全部上傳');
      router.refresh();
    }
  }

  async function handleFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('photo', file, file.name || 'receipt.jpg');
      const res = await fetch('/api/expenses/capture', { method: 'POST', body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || '上傳失敗');
      }
      setToast('已收到 · 待確認 +1');
      router.refresh();
    } catch (e) {
      // Fallback: queue offline
      try {
        const dataUrl = await fileToDataUrl(file);
        const q = loadQueue();
        q.push({
          id: crypto.randomUUID(),
          dataUrl,
          mediaType: file.type || 'image/jpeg',
          addedAt: Date.now(),
        });
        saveQueue(q);
        setQueueCount(q.length);
        setError((e as Error).message + ' — 已加入離線佇列');
      } catch {
        setError((e as Error).message);
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function openShutter() {
    if (uploading) return;
    fileRef.current?.click();
  }

  async function submitNoReceipt() {
    if (!sheet) return;
    const amt = parseInt(amount, 10);
    if (!Number.isFinite(amt) || amt <= 0) {
      setSheetError('請輸入金額');
      return;
    }
    setSheetError(null);
    setSheetSubmitting(true);
    try {
      const res = await fetch('/api/expenses/no-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: sheet, amount_twd: amt }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || '建立失敗');
      }
      setSheet(null);
      setAmount('');
      setToast('已收到 · 待確認 +1');
      router.refresh();
    } catch (e) {
      setSheetError((e as Error).message);
    } finally {
      setSheetSubmitting(false);
    }
  }

  function keypadPress(d: string) {
    if (sheetSubmitting) return;
    setSheetError(null);
    if (d === 'del') {
      setAmount((a) => a.slice(0, -1));
      return;
    }
    if (amount.length >= 6) return;
    if (amount === '' && d === '0') return;
    setAmount((a) => a + d);
  }

  return (
    <div className="flex-1 flex flex-col min-h-full bg-neutral-900 text-white">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />

      {queueCount > 0 ? (
        <button
          onClick={flushQueue}
          className="mx-4 mt-4 rounded-xl bg-amber-500 text-black px-4 py-2 text-sm font-medium"
        >
          {queueCount} 筆待上傳 · 點此重試
        </button>
      ) : null}

      {error ? (
        <div className="mx-4 mt-3 rounded-xl bg-red-600 px-4 py-3 text-sm" role="alert">
          {error}
        </div>
      ) : null}

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 gap-6">
        <button
          onClick={openShutter}
          disabled={uploading}
          className="w-56 h-56 rounded-full bg-white text-neutral-900 text-2xl font-semibold shadow-2xl border-8 border-neutral-300 active:scale-95 transition disabled:opacity-60"
        >
          {uploading ? '上傳中…' : '拍收據'}
        </button>
        <p className="text-neutral-400 text-sm">拍完即存,AI 稍後自動辨識</p>

        <button
          onClick={() => setSheet('fuel')}
          disabled={uploading}
          className="mt-4 px-6 py-3 rounded-2xl bg-neutral-800 border border-neutral-700 text-base font-medium active:scale-98"
        >
          無收據?
        </button>
      </div>

      {toast ? (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-5 py-3 rounded-full text-sm shadow-xl z-50">
          {toast}
        </div>
      ) : null}

      {sheet ? (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center">
          <div className="w-full sm:max-w-md bg-white text-neutral-900 dark:bg-neutral-900 dark:text-white rounded-t-3xl sm:rounded-3xl p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">無收據快速記帳</h2>
              <button
                onClick={() => {
                  setSheet(null);
                  setAmount('');
                  setSheetError(null);
                }}
                className="text-sm text-neutral-500 underline"
              >
                取消
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setSheet('fuel')}
                className={`py-4 rounded-2xl text-lg font-medium border ${
                  sheet === 'fuel'
                    ? 'bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-900'
                    : 'bg-white text-neutral-900 border-neutral-300 dark:bg-neutral-800 dark:text-white dark:border-neutral-700'
                }`}
              >
                加油
              </button>
              <button
                onClick={() => setSheet('parking')}
                className={`py-4 rounded-2xl text-lg font-medium border ${
                  sheet === 'parking'
                    ? 'bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-900'
                    : 'bg-white text-neutral-900 border-neutral-300 dark:bg-neutral-800 dark:text-white dark:border-neutral-700'
                }`}
              >
                停車
              </button>
            </div>

            <div className="mt-2 text-center text-4xl font-bold tabular-nums min-h-[56px]">
              {amount ? `NT$ ${parseInt(amount, 10).toLocaleString('zh-TW')}` : (
                <span className="text-neutral-400 text-2xl">輸入金額</span>
              )}
            </div>

            {sheetError ? (
              <p className="text-center text-sm text-red-600" role="alert">
                {sheetError}
              </p>
            ) : null}

            <div className="grid grid-cols-3 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'].map((k) => {
                if (k === 'ok') {
                  return (
                    <button
                      key={k}
                      onClick={submitNoReceipt}
                      disabled={sheetSubmitting || !amount}
                      className="min-h-[56px] rounded-2xl bg-emerald-600 text-white text-lg font-semibold disabled:opacity-50"
                    >
                      送出
                    </button>
                  );
                }
                if (k === 'del') {
                  return (
                    <button
                      key={k}
                      onClick={() => keypadPress('del')}
                      className="min-h-[56px] rounded-2xl bg-neutral-100 dark:bg-neutral-800 text-lg"
                    >
                      ⌫
                    </button>
                  );
                }
                return (
                  <button
                    key={k}
                    onClick={() => keypadPress(k)}
                    className="min-h-[56px] rounded-2xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-2xl font-medium"
                  >
                    {k}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
