'use client';

import { useState } from 'react';

interface Props { defaultMonth: string }

function monthBounds(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const from = `${y}-${String(m).padStart(2, '0')}-01`;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const to = `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  return { from, to };
}

export default function ExportCsvDialog({ defaultMonth }: Props) {
  const [open, setOpen] = useState(false);
  const bounds = monthBounds(defaultMonth);
  const [from, setFrom] = useState(bounds.from);
  const [to, setTo] = useState(bounds.to);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      setError('日期格式錯誤');
      return;
    }
    if (from > to) { setError('起日不可晚於迄日'); return; }
    const url = `/api/ledger/external.csv?from=${from}&to=${to}`;
    window.open(url, '_blank');
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-4 py-2 rounded border border-neutral-300 dark:border-neutral-700"
      >匯出外帳 CSV</button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-lg max-w-md w-full p-4 space-y-3">
            <h2 className="text-lg font-semibold">匯出外帳 CSV</h2>
            <p className="text-sm text-neutral-500">僅匯出「列外帳且未作廢」的紀錄</p>
            <div>
              <label className="text-sm text-neutral-500">起日</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full border border-neutral-300 dark:border-neutral-700 rounded px-3 py-2 bg-white dark:bg-neutral-900"
              />
            </div>
            <div>
              <label className="text-sm text-neutral-500">迄日</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full border border-neutral-300 dark:border-neutral-700 rounded px-3 py-2 bg-white dark:bg-neutral-900"
              />
            </div>
            {error && (
              <div className="rounded border border-red-300 bg-red-50 dark:bg-red-950/40 dark:border-red-800 text-red-700 dark:text-red-200 px-3 py-2 text-sm">
                {error}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setOpen(false)} className="px-4 py-2 rounded border border-neutral-300 dark:border-neutral-700">取消</button>
              <button
                onClick={submit}
                className="px-4 py-2 rounded bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
              >下載</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
