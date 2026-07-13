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
      <h1 className="text-xl font-semibold">確認一筆代墊</h1>

      {receiptUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={receiptUrl}
          alt="收據"
          className="w-full max-h-72 object-contain rounded-2xl bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800"
        />
      ) : (
        <div className="rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700 p-6 text-center text-sm text-neutral-500">
          無收據
        </div>
      )}

      {needManual ? (
        <div className="rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 text-sm font-medium">
          AI 未辨識,請手動填寫
        </div>
      ) : null}

      <div>
        <label className="text-sm text-neutral-600 dark:text-neutral-400">日期</label>
        <input
          type="date"
          value={spentOn}
          onChange={(e) => setSpentOn(e.target.value)}
          className="mt-1 w-full px-3 py-3 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 text-base"
        />
      </div>

      <div>
        <label className="text-sm text-neutral-600 dark:text-neutral-400">分類</label>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {CATS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`py-3 rounded-xl border text-base ${
                category === c
                  ? 'bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-900'
                  : 'bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-700'
              }`}
            >
              {CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-sm text-neutral-600 dark:text-neutral-400">金額 (NT$)</label>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
          placeholder="請輸入金額"
          className="mt-1 w-full px-3 py-3 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 text-lg tabular-nums"
        />
        {amount ? (
          <p className="mt-1 text-sm text-neutral-500 tabular-nums">
            = NT$ {parseInt(amount, 10).toLocaleString('zh-TW')}
          </p>
        ) : null}
      </div>

      <div>
        <label className="text-sm text-neutral-600 dark:text-neutral-400">品項</label>
        <input
          type="text"
          value={itemText}
          onChange={(e) => setItemText(e.target.value)}
          placeholder="例:加油、變壓器"
          className="mt-1 w-full px-3 py-3 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 text-base"
        />
      </div>

      {sites.length > 0 ? (
        <div>
          <label className="text-sm text-neutral-600 dark:text-neutral-400">案場 (選填)</label>
          <select
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            className="mt-1 w-full px-3 py-3 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 text-base"
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
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex gap-3 mt-2">
        <button
          onClick={voidIt}
          disabled={busy}
          className="flex-1 py-3 rounded-2xl border border-neutral-300 dark:border-neutral-700 text-base disabled:opacity-50"
        >
          作廢
        </button>
        <button
          onClick={submit}
          disabled={busy}
          className="flex-[2] py-3 rounded-2xl bg-emerald-600 text-white text-base font-semibold disabled:opacity-50"
        >
          {busy ? '送出中…' : '送出'}
        </button>
      </div>
    </div>
  );
}
