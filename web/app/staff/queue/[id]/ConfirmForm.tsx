'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CATEGORY_LABEL, type ExpenseRecord, type ExpenseCategory } from '@/lib/types';

interface Site {
  id: string;
  name: string;
}

interface Props {
  row: ExpenseRecord;
  receiptUrl: string | null;
  sites: Site[];
}

const CATS: ExpenseCategory[] = ['fuel', 'parking', 'materials', 'other'];

function todayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export default function ConfirmForm({ row, receiptUrl, sites }: Props) {
  const router = useRouter();
  const draft = row.ai_draft;
  const needManual = !draft || draft.confidence === 'low';

  const [spentOn, setSpentOn] = useState(row.spent_on || draft?.spent_on || todayIso());
  const [category, setCategory] = useState<ExpenseCategory | ''>(
    (row.category as ExpenseCategory | null) ?? draft?.category ?? '',
  );
  const [amount, setAmount] = useState(
    row.amount_twd != null ? String(row.amount_twd) : draft?.amount_twd != null ? String(draft.amount_twd) : '',
  );
  const [itemText, setItemText] = useState(row.item_text ?? draft?.item_text ?? '');
  const [siteId, setSiteId] = useState(row.site_id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    if (!category) {
      setError('請選擇分類');
      return;
    }
    const amt = parseInt(amount, 10);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('金額必須為大於 0 的整數');
      return;
    }
    if (!spentOn || !/^\d{4}-\d{2}-\d{2}$/.test(spentOn)) {
      setError('請選擇日期');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/expenses/${row.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spent_on: spentOn,
          category,
          amount_twd: amt,
          item_text: itemText.trim() || CATEGORY_LABEL[category],
          site_id: siteId || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || '送出失敗');
      }
      router.replace('/staff/queue');
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function voidIt() {
    if (!confirm('確定作廢這筆?作廢後無法還原。')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/expenses/${row.id}/void`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || '作廢失敗');
      }
      router.replace('/staff/queue');
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold" style={{ color: 'var(--nm-text-primary)' }}>確認一筆代墊</h1>

      {receiptUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={receiptUrl}
          alt="收據"
          className="w-full max-h-72 object-contain rounded-2xl nm-inset"
        />
      ) : (
        <div className="rounded-2xl nm-inset p-6 text-center text-sm" style={{ color: 'var(--nm-text-muted)', border: '1px dashed rgba(255,255,255,0.18)' }}>
          無收據
        </div>
      )}

      {needManual ? (
        <div
          className="rounded-xl px-4 py-3 text-sm font-medium"
          style={{ background: 'rgba(224,122,122,0.1)', border: '1px solid rgba(224,122,122,0.34)', color: 'var(--nm-danger-glass-text)' }}
        >
          AI 未辨識,請手動填寫
        </div>
      ) : null}

      <div>
        <label className="text-sm" style={{ color: 'var(--nm-text-secondary)' }}>日期</label>
        <input
          type="date"
          value={spentOn}
          onChange={(e) => setSpentOn(e.target.value)}
          className="mt-1 nm-input text-base"
        />
      </div>

      <div>
        <label className="text-sm" style={{ color: 'var(--nm-text-secondary)' }}>分類</label>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {CATS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={category === c ? 'nm-btn-solid py-3 text-base' : 'nm-btn py-3 text-base'}
            >
              {CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-sm" style={{ color: 'var(--nm-text-secondary)' }}>金額 ($)</label>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
          placeholder="請輸入金額"
          className="mt-1 nm-input text-lg tabular"
        />
        {amount ? (
          <p className="mt-1 text-sm tabular" style={{ color: 'var(--nm-text-muted)' }}>
            = ${parseInt(amount, 10).toLocaleString('zh-TW')}
          </p>
        ) : null}
      </div>

      <div>
        <label className="text-sm" style={{ color: 'var(--nm-text-secondary)' }}>品項</label>
        <input
          type="text"
          value={itemText}
          onChange={(e) => setItemText(e.target.value)}
          placeholder="例:加油、變壓器"
          className="mt-1 nm-input text-base"
        />
      </div>

      {sites.length > 0 ? (
        <div>
          <label className="text-sm" style={{ color: 'var(--nm-text-secondary)' }}>案場 (選填)</label>
          <select
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            className="mt-1 nm-input text-base"
          >
            <option value="">— 未指定 —</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {error ? (
        <p className="text-sm" style={{ color: 'var(--nm-danger)' }} role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex gap-3 mt-2">
        <button
          onClick={voidIt}
          disabled={busy}
          className="flex-1 nm-danger text-base"
        >
          作廢
        </button>
        <button
          onClick={submit}
          disabled={busy}
          className="flex-[2] nm-success-btn text-base"
        >
          {busy ? '送出中…' : '送出'}
        </button>
      </div>
    </div>
  );
}
