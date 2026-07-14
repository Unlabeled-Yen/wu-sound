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
    if (!selected) { setError('請選擇一個薪資結算'); return; }
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
        className="nm-btn text-[13px]"
      >從薪資結算匯入零用金</button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="rounded-2xl nm-raised-lg max-w-md w-full p-6 space-y-4" style={{ background: 'rgba(24,24,28,0.75)' }}>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--nm-text-primary)' }}>從薪資結算匯入零用金</h2>

            {result ? (
              <div className="text-[13px]" style={{ color: 'var(--nm-text-body)' }}>
                <p>已新增 <span className="font-semibold">{result.created}</span> 筆 · 略過 <span className="font-semibold">{result.skipped}</span> 筆</p>
                <div className="flex justify-end pt-3">
                  <button onClick={close} className="nm-btn-solid text-[13.5px]">關閉</button>
                </div>
              </div>
            ) : (
              <>
                {!batches && <p className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>載入中…</p>}
                {batches && batches.length === 0 && (
                  <p className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>尚未有任何已鎖定的薪資結算</p>
                )}
                {batches && batches.length > 0 && (
                  <div className="space-y-2">
                    {batches.map((b) => (
                      <label key={b.id} className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--nm-text-body)' }}>
                        <input
                          type="radio"
                          name="batch"
                          value={b.id}
                          checked={selected === b.id}
                          onChange={() => setSelected(b.id)}
                        />
                        <span>{b.month.slice(0, 7)} 薪資結算</span>
                        {b.has_reimbursement_entries && (
                          <span className="text-xs" style={{ color: 'var(--nm-warning)' }}>(已匯入部分)</span>
                        )}
                      </label>
                    ))}
                  </div>
                )}
                {error && (
                  <div
                    className="rounded-xl px-3 py-2 text-[13px]"
                    style={{
                      background: 'rgba(224, 122, 122, 0.08)',
                      border: '1px solid rgba(224, 122, 122, 0.34)',
                      color: 'var(--nm-danger-glass-text)',
                    }}
                  >
                    {error}
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-1">
                  <button onClick={close} className="nm-btn text-[13px]">取消</button>
                  <button
                    onClick={submit}
                    disabled={busy || !selected}
                    className="nm-btn-solid text-[13.5px] disabled:opacity-50"
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
