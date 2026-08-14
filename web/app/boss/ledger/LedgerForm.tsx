'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  JOURNAL_KINDS,
  JOURNAL_ORDER,
  LEDGER_KIND_LABEL,
  LEDGER_JOURNAL_LABEL,
  LEDGER_PAYMENT_METHOD_LABEL,
  INVOICE_STATUS_LABEL,
  suggestTax,
  directionOfKind,
  journalOfKind,
  type LedgerKind,
  type LedgerJournal,
  type LedgerPaymentMethod,
  type InvoiceStatus,
  type LedgerEntry,
} from '@/lib/types';
import { validateLedger } from '@/lib/ledger-validation';
import { taipeiTodayStr } from '@/lib/tz';

interface Props {
  mode: 'create' | 'edit';
  initial?: LedgerEntry | null;
  locked?: boolean; // 由月結匯入,鎖大部分欄位
  defaultMonth?: string;
  defaultJournal?: LedgerJournal;
}

export default function LedgerForm({ mode, initial, locked, defaultMonth, defaultJournal }: Props) {
  const [journal, setJournal] = useState<LedgerJournal>(
    initial ? journalOfKind(initial.kind, 'vendor') : (defaultJournal ?? 'vendor'),
  );
  const [kind, setKind] = useState<LedgerKind>(initial?.kind ?? JOURNAL_KINDS[journal][0]);
  const direction = directionOfKind(kind);
  const [amount, setAmount] = useState<string>(initial?.amount_twd ? String(initial.amount_twd) : '');
  const [fee, setFee] = useState<string>(initial?.fee_twd ? String(initial.fee_twd) : '0');
  const [paymentMethod, setPaymentMethod] = useState<LedgerPaymentMethod | ''>(initial?.payment_method ?? '');
  const [siteId, setSiteId] = useState<string>(initial?.site_id ?? '');
  const [sites, setSites] = useState<Array<{ id: string; name: string }>>([]);
  const [receivableId, setReceivableId] = useState<string>(initial?.receivable_id ?? '');
  const [receivables, setReceivables] = useState<Array<{ id: string; party: string; remaining_twd: number }>>([]);
  const [party, setParty] = useState<string>(initial?.party ?? '');
  const [memo, setMemo] = useState<string>(initial?.memo ?? '');
  const [isExternal, setIsExternal] = useState<boolean>(initial?.is_external ?? false);
  const [invoiceStatus, setInvoiceStatus] = useState<InvoiceStatus>(initial?.invoice_status ?? 'none');
  const [invoiceNo, setInvoiceNo] = useState<string>(initial?.invoice_no ?? '');
  const [invoiceDate, setInvoiceDate] = useState<string>(initial?.invoice_date ?? '');
  const [tax, setTax] = useState<string>(initial?.tax_amount_twd ? String(initial.tax_amount_twd) : '');
  const [taxTouched, setTaxTouched] = useState<boolean>(Boolean(initial?.tax_amount_twd));
  const [occurred, setOccurred] = useState<string>(
    initial?.occurred_on ?? (defaultMonth ? `${defaultMonth}-01` : taipeiTodayStr()),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const kindOptions = useMemo(() => JOURNAL_KINDS[journal], [journal]);

  useEffect(() => {
    fetch('/api/sites?active=1', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setSites(j.sites ?? []))
      .catch(() => {});
  }, []);

  // 應收(direction=income)/應付(direction=expense)對應的未結約定,供選填掛帳
  useEffect(() => {
    const wanted = direction === 'income' ? 'receivable' : 'payable';
    fetch(`/api/receivables?status=open&direction=${wanted}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setReceivables(j.rows ?? []))
      .catch(() => setReceivables([]));
    setReceivableId((cur) => (initial?.receivable_id && initial.direction === direction ? cur : ''));
  }, [direction, initial?.receivable_id, initial?.direction]);

  function onJournalChange(next: LedgerJournal) {
    if (locked) return;
    setJournal(next);
    if (!JOURNAL_KINDS[next].includes(kind)) setKind(JOURNAL_KINDS[next][0]);
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
      fee_twd: Number(fee || 0),
      party: party.trim() || null,
      memo: memo.trim() || null,
      is_external: isExternal,
      invoice_status: invoiceStatus,
      invoice_no: invoiceNo.trim() || null,
      invoice_date: invoiceDate || null,
      tax_amount_twd: isExternal ? Number(tax || 0) : 0,
      site_id: siteId || null,
      receivable_id: receivableId || null,
      payment_method: paymentMethod || null,
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
      window.location.href = `/boss/ledger/entries?month=${month}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : '網路錯誤');
      setBusy(false);
    }
  }

  const inputCls = 'nm-input disabled:opacity-50';
  const labelCls = 'text-[13px]';
  const labelStyle = { color: 'var(--nm-text-secondary)' };

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-w-2xl">
      {locked && (
        <div
          className="rounded-xl px-3 py-2 text-[13px]"
          style={{
            background: 'rgba(217, 181, 107, 0.08)',
            border: '1px solid rgba(217, 181, 107, 0.28)',
            color: 'var(--nm-warning-glass-text)',
          }}
        >
          本筆由薪資結算匯入,只能補備註與發票資訊
        </div>
      )}

      <div>
        <label className={labelCls} style={labelStyle}>日期</label>
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
        <label className={labelCls} style={labelStyle}>帳簿</label>
        <div className="flex flex-wrap gap-2 mt-1">
          {JOURNAL_ORDER.map((j) => (
            <button
              key={j}
              type="button"
              onClick={() => onJournalChange(j)}
              disabled={locked}
              className={journal === j ? 'nm-btn-solid' : 'nm-btn'}
              style={{ borderRadius: 999, padding: '4px 14px', minHeight: 'auto', fontSize: 13 }}
            >
              {LEDGER_JOURNAL_LABEL[j]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className={labelCls} style={labelStyle}>類別 · {direction === 'income' ? '收入' : '支出'}</label>
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
        <label className={labelCls} style={labelStyle}>金額(元)</label>
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
        <label className={labelCls} style={labelStyle}>對象(客戶/廠商/員工)</label>
        <input
          type="text"
          value={party}
          onChange={(e) => setParty(e.target.value)}
          disabled={locked}
          className={inputCls}
        />
      </div>

      {/* 進階選項:八成情況只需要上面幾格,案場/手續費/掛約定/付款方式收起來, */}
      {/* 需要的人自己展開,不強迫每筆都面對全部欄位。 */}
      <details className="rounded-xl nm-inset p-3">
        <summary className="text-[13px] cursor-pointer select-none" style={{ color: 'var(--nm-text-secondary)' }}>
          進階選項(案場、手續費、付款方式⋯)
        </summary>
        <div className="space-y-4 mt-3">
          <div>
            <label className={labelCls} style={labelStyle}>案場/專案(選填)</label>
            <select
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              className={inputCls}
            >
              <option value="">— 不掛專案 —</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {receivables.length > 0 && (
            <div>
              <label className={labelCls} style={labelStyle}>掛應收應付約定(選填)</label>
              <select
                value={receivableId}
                onChange={(e) => setReceivableId(e.target.value)}
                className={inputCls}
              >
                <option value="">— 不掛約定 —</option>
                {receivables.map((r) => (
                  <option key={r.id} value={r.id}>{r.party} · 未結 ${r.remaining_twd.toLocaleString('zh-TW')}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className={labelCls} style={labelStyle}>付款方式(選填)</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as LedgerPaymentMethod | '')}
              className={inputCls}
            >
              <option value="">— 不指定 —</option>
              {(Object.entries(LEDGER_PAYMENT_METHOD_LABEL) as [LedgerPaymentMethod, string][]).map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls} style={labelStyle}>手續費(元)· 轉帳費另計,不混進金額</label>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              disabled={locked}
              className={inputCls}
            />
          </div>
        </div>
      </details>

      <div>
        <label className={labelCls} style={labelStyle}>備註</label>
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          rows={2}
          className={inputCls}
        />
      </div>

      <div>
        <label className="flex items-center gap-2" style={{ color: 'var(--nm-text-body)' }}>
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
        <div className="rounded-xl nm-inset p-3 space-y-3">
          <div>
            <label className={labelCls} style={labelStyle}>發票狀態</label>
            <div className="flex gap-3 mt-1" style={{ color: 'var(--nm-text-body)' }}>
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
            <label className={labelCls} style={labelStyle}>發票號</label>
            <input
              type="text"
              value={invoiceNo}
              onChange={(e) => setInvoiceNo(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls} style={labelStyle}>發票日期{invoiceStatus === 'issued' && ' *'}</label>
            <input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className={inputCls}
              required={invoiceStatus === 'issued'}
            />
          </div>
          <div>
            <label className={labelCls} style={labelStyle}>
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

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={busy}
          className="nm-btn-solid text-[13px]"
        >{busy ? '送出中…' : (mode === 'create' ? '新增' : '儲存')}</button>
        <a href="/boss/ledger" className="nm-btn text-[13px]">取消</a>
      </div>
    </form>
  );
}
