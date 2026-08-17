'use client';

import { useState } from 'react';

// 改月薪=新增一筆新生效日紀錄,不覆寫舊的——見 lib/payroll.ts 的生效日期制說明。
// 預設生效日=今天,老闆可改成過去/未來日期(例如這個月才調薪,補一筆本月生效)。
// month=目前月結中心正在看的月份,如果那個月已經結算過,存完會立刻同步。
export default function PayProfileButton({ userId, currentSalary, month }: { userId: string; currentSalary: number | null; month: string }) {
  const [editing, setEditing] = useState(false);
  const [salary, setSalary] = useState(currentSalary ? String(currentSalary) : '');
  const [effectiveFrom, setEffectiveFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    setError(null);
    const amount = Number(salary);
    if (!Number.isInteger(amount) || amount <= 0) { setError('月薪必須為正整數'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/payroll/pay-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, monthly_salary_twd: amount, effective_from: effectiveFrom, month }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || '設定失敗');
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : '設定失敗');
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} className="nm-btn text-xs" style={{ padding: '3px 10px', minHeight: 'auto' }}>
        {currentSalary ? '調整月薪' : '設定月薪'}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 items-start">
      <div className="flex items-center gap-1.5">
        <input
          type="number" inputMode="numeric" min={1} step={1}
          value={salary} onChange={(e) => setSalary(e.target.value)} disabled={busy}
          placeholder="月薪"
          className="nm-input text-xs" style={{ padding: '3px 6px', minHeight: 'auto', width: 90 }}
        />
        <input
          type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} disabled={busy}
          className="nm-input text-xs" style={{ padding: '3px 6px', minHeight: 'auto', width: 140 }}
        />
      </div>
      <div className="flex items-center gap-1.5">
        <button type="button" disabled={busy} onClick={onSave} className="nm-btn text-xs" style={{ padding: '3px 10px', minHeight: 'auto' }}>
          {busy ? '儲存中…' : '儲存'}
        </button>
        <button type="button" disabled={busy} onClick={() => { setEditing(false); setError(null); }} className="nm-btn text-xs" style={{ padding: '3px 10px', minHeight: 'auto' }}>
          取消
        </button>
      </div>
      {error && <span className="text-xs" style={{ color: 'var(--nm-danger)' }}>{error}</span>}
    </div>
  );
}
