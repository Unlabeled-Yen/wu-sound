'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface BatchRow {
  id: string;
  month: string;
  has_reimbursement_entries: boolean;
}

export default function ImportBatchDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [batches, setBatches] = useState<BatchRow[] | null>(null);
  const [selected, setSelected] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    fetch('/api/boss/close-batches')
      .then((r) => r.json())
      .then((j) => { if (!cancelled) setBatches(j.rows ?? []); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : '載入失敗'); });
    return () => { cancelled = true; };
  }, [open]);

  async function submit() {
    if (!selected) { setError('請選擇一個月結'); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/ledger/import-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch_id: selected }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error ?? '匯入失敗');
        setBusy(false);
        return;
      }
      setResult({ created: j.created ?? 0, skipped: j.skipped ?? 0 });
      setBusy(false);
      if ((j.created ?? 0) > 0) router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '網路錯誤');
      setBusy(false);
    }
  }

  function close() {
    setOpen(false);
    setSelected('');
    setResult(null);
    setError(null);
    setBatches(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-4 py-2 rounded border border-neutral-300 dark:border-neutral-700"
      >從月結匯入零用金</button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-lg max-w-md w-full p-4 space-y-3">
            <h2 className="text-lg font-semibold">從月結匯入零用金</h2>

            {result ? (
              <div className="text-sm">
                <p>已新增 <span className="font-semibold">{result.created}</span> 筆 · 略過 <span className="font-semibold">{result.skipped}</span> 筆</p>
                <div className="flex justify-end pt-3">
                  <button onClick={close} className="px-4 py-2 rounded bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900">關閉</button>
                </div>
              </div>
            ) : (
              <>
                {!batches && <p className="text-sm text-neutral-500">載入中…</p>}
                {batches && batches.length === 0 && (
                  <p className="text-sm text-neutral-500">尚未有任何已鎖定的月結</p>
                )}
                {batches && batches.length > 0 && (
                  <div className="space-y-2">
                    {batches.map((b) => (
                      <label key={b.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="batch"
                          value={b.id}
                          checked={selected === b.id}
                          onChange={() => setSelected(b.id)}
                        />
                        <span>{b.month.slice(0, 7)} 月結</span>
                        {b.has_reimbursement_entries && (
                          <span className="text-xs text-amber-600">(已匯入部分)</span>
                        )}
                      </label>
                    ))}
                  </div>
                )}
                {error && (
                  <div className="rounded border border-red-300 bg-red-50 dark:bg-red-950/40 dark:border-red-800 text-red-700 dark:text-red-200 px-3 py-2 text-sm">
                    {error}
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={close} className="px-4 py-2 rounded border border-neutral-300 dark:border-neutral-700">取消</button>
                  <button
                    onClick={submit}
                    disabled={busy || !selected}
                    className="px-4 py-2 rounded bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 disabled:opacity-50"
                  >{busy ? '匯入中…' : '確認匯入'}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
