'use client';

import { useMemo, useState } from 'react';
import {
  INCOME_KINDS,
  EXPENSE_KINDS,
  LEDGER_KIND_LABEL,
  INVOICE_STATUS_LABEL,
  suggestTax,
  type LedgerDirection,
  type LedgerKind,
  type InvoiceStatus,
  type LedgerEntry,
} from '@/lib/types';
import { validateLedger } from '@/lib/ledger-validation';

interface Props {
  mode: 'create' | 'edit';
  initial?: LedgerEntry | null;
  locked?: boolean; // 由月結匯入,鎖大部分欄位
  defaultMonth?: string;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function LedgerForm({ mode, initial, locked, defaultMonth }: Props) {
  const [direction, setDirection] = useState<LedgerDirection>(initial?.direction ?? 'expense');
  const [kind, setKind] = useState<LedgerKind>(initial?.kind ?? 'reimbursement');
  const [amount, setAmount] = useState<string>(initial?.amount_twd ? String(initial.amount_twd) : '');
  const [party, setParty] = useState<string>(initial?.party ?? '');
  const [memo, setMemo] = useState<string>(initial?.memo ?? '');
  const [isExternal, setIsExternal] = useState<boolean>(initial?.is_external ?? false);
  const [invoiceStatus, setInvoiceStatus] = useState<InvoiceStatus>(initial?.invoice_status ?? 'none');
  const [invoiceNo, setInvoiceNo] = useState<string>(initial?.invoice_no ?? '');
  const [invoiceDate, setInvoiceDate] = useState<string>(initial?.invoice_date ?? '');
  const [tax, setTax] = useState<string>(initial?.tax_amount_twd ? String(initial.tax_amount_twd) : '');
  const [taxTouched, setTaxTouched] = useState<boolean>(Boolean(initial?.tax_amount_twd));
  const [occurred, setOccurred] = useState<string>(
    initial?.occurred_on ?? (defaultMonth ? `${defaultMonth}-01` : todayStr()),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const kindOptions = useMemo(
    () => (direction === 'income' ? INCOME_KINDS : EXPENSE_KINDS),
    [direction],
  );

  function onDirectionChange(next: LedgerDirection) {
    if (locked) return;
    setDirection(next);
    const opts = next === 'income' ? INCOME_KINDS : EXPENSE_KINDS;
    if (!opts.includes(kind)) setKind(opts[0]);
  }

  function onAmountChange(next: string) {
    if (locked) return;
    setAmount(next);
    const n = Number(next);
    if (isExternal && !taxTouched && Number.isFinite(n) && n > 0) {
      setTax(String(suggestTax(n)));
    }
  }

  function onIsExternalChange(next: boolean) {
    if (locked) return;
    setIsExternal(next);
    if (!next) {
      setTax('0');
      setInvoiceStatus('none');
      setInvoiceNo('');
      setInvoiceDate('');
    } else {
      const n = Number(amount);
      if (!taxTouched && Number.isFinite(n) && n > 0) setTax(String(suggestTax(n)));
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const input = {
      occurred_on: occurred,
      direction,
      kind,
      amount_twd: Number(amount),
      party: party.trim() || null,
      memo: memo.trim() || null,
      is_external: isExternal,
      invoice_status: invoiceStatus,
      invoice_no: invoiceNo.trim() || null,
      invoice_date: invoiceDate || null,
      tax_amount_twd: isExternal ? Number(tax || 0) : 0,
    };
    const err = validateLedger(input);
    if (err) { setError(err); return; }
    setBusy(true);
    try {
      const url = mode === 'create' ? '/api/ledger' : `/api/ledger/${initial?.id}`;
      const method = mode === 'create' ? 'POST' : 'PATCH';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error ?? '送出失敗');
        setBusy(false);
        return;
      }
      const month = occurred.slice(0, 7);
      window.location.href = `/boss/ledger?month=${month}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : '網路錯誤');
      setBusy(false);
    }
  }

  const inputCls = 'w-full border border-neutral-300 dark:border-neutral-700 rounded px-3 py-2 bg-white dark:bg-neutral-900 disabled:opacity-50';

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-w-2xl">
      {locked && (
        <div className="rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 text-amber-900 dark:text-amber-200 px-3 py-2 text-sm">
          本筆由月結匯入,只能補備註與發票資訊
        </div>
      )}

      <div>
        <label className="text-sm text-neutral-500">日期</label>
        <input
          type="date"
          value={occurred}
          onChange={(e) => setOccurred(e.target.value)}
          disabled={locked}
          className={inputCls}
          required
        />
      </div>

      <div>
        <label className="text-sm text-neutral-500">方向</label>
        <div className="flex gap-3 mt-1">
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name="direction"
              checked={direction === 'income'}
              onChange={() => onDirectionChange('income')}
              disabled={locked}
            /> 收入
          </label>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name="direction"
              checked={direction === 'expense'}
              onChange={() => onDirectionChange('expense')}
              disabled={locked}
            /> 支出
          </label>
        </div>
      </div>

      <div>
        <label className="text-sm text-neutral-500">類別</label>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as LedgerKind)}
          disabled={locked}
          className={inputCls}
        >
          {kindOptions.map((k) => (
            <option key={k} value={k}>{LEDGER_KIND_LABEL[k]}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-sm text-neutral-500">金額(元)</label>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={amount}
          onChange={(e) => onAmountChange(e.target.value)}
          disabled={locked}
          className={inputCls}
          required
        />
      </div>

      <div>
        <label className="text-sm text-neutral-500">對象(客戶/廠商/員工)</label>
        <input
          type="text"
          value={party}
          onChange={(e) => setParty(e.target.value)}
          disabled={locked}
          className={inputCls}
        />
      </div>

      <div>
        <label className="text-sm text-neutral-500">備註</label>
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          rows={2}
          className={inputCls}
        />
      </div>

      <div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isExternal}
            onChange={(e) => onIsExternalChange(e.target.checked)}
            disabled={locked}
          />
          <span>列外帳(可打統編、有發票)</span>
        </label>
      </div>

      {isExternal && (
        <div className="rounded border border-neutral-200 dark:border-neutral-800 p-3 space-y-3">
          <div>
            <label className="text-sm text-neutral-500">發票狀態</label>
            <div className="flex gap-3 mt-1">
              {(['none', 'to_issue', 'issued'] as const).map((s) => (
                <label key={s} className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="invoice_status"
                    checked={invoiceStatus === s}
                    onChange={() => setInvoiceStatus(s)}
                  />
                  {INVOICE_STATUS_LABEL[s]}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm text-neutral-500">發票號</label>
            <input
              type="text"
              value={invoiceNo}
              onChange={(e) => setInvoiceNo(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="text-sm text-neutral-500">發票日期{invoiceStatus === 'issued' && ' *'}</label>
            <input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className={inputCls}
              required={invoiceStatus === 'issued'}
            />
          </div>
          <div>
            <label className="text-sm text-neutral-500">
              稅額(元)· 建議 5%: ${suggestTax(Number(amount) || 0).toLocaleString('zh-TW')}
            </label>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={tax}
              onChange={(e) => { setTax(e.target.value); setTaxTouched(true); }}
              className={inputCls}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="rounded border border-red-300 bg-red-50 dark:bg-red-950/40 dark:border-red-800 text-red-700 dark:text-red-200 px-3 py-2 text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={busy}
          className="px-4 py-2 rounded bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 disabled:opacity-50"
        >{busy ? '送出中…' : (mode === 'create' ? '新增' : '儲存')}</button>
        <a href="/boss/ledger" className="px-4 py-2 rounded border border-neutral-300 dark:border-neutral-700">取消</a>
      </div>
    </form>
  );
}
