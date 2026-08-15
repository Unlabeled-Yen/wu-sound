'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

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
    <div className="flex-1 flex flex-col min-h-full">
      {/* 待確認清單不再獨立佔一格底部分頁(見 layout.tsx 收攏說明),入口移到這裡 */}
      <Link
        href="/staff/queue"
        className="flex items-center justify-between rounded-2xl nm-raised px-4 py-3 nm-focus"
        style={{ color: 'var(--nm-text-body)' }}
      >
        <span className="text-[14px] font-medium">待確認清單</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--nm-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m9 6 6 6-6 6" />
        </svg>
      </Link>

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
        <button onClick={flushQueue} className="nm-btn text-[13px] w-full" style={{ color: 'var(--nm-warning-glass-text)' }}>
          {queueCount} 筆待上傳 · 點此重試
        </button>
      ) : null}

      {error ? (
        <div className="mt-3 nm-inset rounded-xl px-4 py-3 text-[13px]" style={{ color: 'var(--nm-danger)' }} role="alert">
          {error}
        </div>
      ) : null}

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 gap-6">
        <button
          onClick={openShutter}
          disabled={uploading}
          className="w-[216px] h-[216px] rounded-full flex flex-col items-center justify-center gap-2 active:scale-[0.96] transition disabled:opacity-60 nm-focus"
          style={{
            background: 'radial-gradient(circle at 50% 38%, #ffffff, #d6d6d8)',
            border: '9px solid rgba(255,255,255,0.22)',
            boxShadow: '0 24px 60px -18px rgba(0,0,0,0.8)',
            color: '#1a1a1a',
          }}
        >
          <ShutterIcon />
          <span className="text-xl font-semibold">{uploading ? '上傳中…' : '拍收據'}</span>
        </button>
        <p
          className="text-sm text-center"
          style={{ color: 'var(--nm-text-secondary)', textShadow: '0 1px 3px rgba(0,0,0,0.65)' }}
        >
          拍完即存,AI 稍後自動辨識
        </p>

        <button
          onClick={() => setSheet('fuel')}
          disabled={uploading}
          className="mt-2 rounded-2xl text-[15px] font-medium active:scale-[0.98] transition nm-focus"
          style={{
            background: 'rgba(30,30,36,0.44)',
            WebkitBackdropFilter: 'blur(14px)',
            backdropFilter: 'blur(14px)',
            border: '1px solid rgba(255,255,255,0.18)',
            color: 'var(--nm-text-body)',
            padding: '13px 26px',
          }}
        >
          無收據?手動記帳
        </button>
      </div>

      {toast ? (
        <div
          className="fixed bottom-24 left-1/2 -translate-x-1/2 px-5 py-3 rounded-full text-sm shadow-xl z-50"
          style={{
            background: 'rgba(126,207,157,0.9)',
            color: '#0f2417',
          }}
        >
          {toast}
        </div>
      ) : null}

      {sheet ? (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center">
          <div className="w-full sm:max-w-md nm-raised-lg rounded-t-3xl sm:rounded-3xl p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold" style={{ color: 'var(--nm-text-primary)' }}>無收據快速記帳</h2>
              <button
                onClick={() => {
                  setSheet(null);
                  setAmount('');
                  setSheetError(null);
                }}
                className="text-sm underline nm-focus"
                style={{ color: 'var(--nm-text-muted)' }}
              >
                取消
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setSheet('fuel')}
                className={sheet === 'fuel' ? 'nm-btn-solid py-4 text-lg' : 'nm-btn py-4 text-lg'}
              >
                加油
              </button>
              <button
                onClick={() => setSheet('parking')}
                className={sheet === 'parking' ? 'nm-btn-solid py-4 text-lg' : 'nm-btn py-4 text-lg'}
              >
                停車
              </button>
            </div>

            <div
              className="mt-2 text-center text-4xl font-bold tabular min-h-[56px]"
              style={{ color: 'var(--nm-text-primary)' }}
            >
              {amount ? `$${parseInt(amount, 10).toLocaleString('zh-TW')}` : (
                <span className="text-2xl" style={{ color: 'var(--nm-text-faint)' }}>輸入金額</span>
              )}
            </div>

            {sheetError ? (
              <p className="text-center text-sm" style={{ color: 'var(--nm-danger)' }} role="alert">
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
                      className="min-h-[56px] rounded-2xl nm-success-btn text-lg"
                    >
                      送出
                    </button>
                  );
                }
                if (k === 'del') {
                  return (
                    <button key={k} onClick={() => keypadPress('del')} className="min-h-[56px] rounded-2xl nm-btn text-lg">
                      ⌫
                    </button>
                  );
                }
                return (
                  <button key={k} onClick={() => keypadPress(k)} className="min-h-[56px] rounded-2xl nm-input text-2xl font-medium">
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

function ShutterIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 4h-5L8 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-4z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}
