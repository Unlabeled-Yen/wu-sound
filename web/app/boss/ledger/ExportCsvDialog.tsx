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
        className="nm-btn text-[13px]"
      >匯出外帳 CSV</button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="rounded-2xl nm-raised-lg max-w-md w-full p-6 space-y-4" style={{ background: 'rgba(24,24,28,0.75)' }}>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--nm-text-primary)' }}>匯出外帳 CSV</h2>
            <p className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>僅匯出「列外帳且未作廢」的紀錄</p>
            <div>
              <label className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>起日</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="nm-input"
              />
            </div>
            <div>
              <label className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>迄日</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="nm-input"
              />
            </div>
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
              <button onClick={() => setOpen(false)} className="nm-btn text-[13px]">取消</button>
              <button
                onClick={submit}
                className="nm-btn-solid text-[13.5px]"
              >下載</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
