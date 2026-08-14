'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  QUOTE_STATUS_LABEL,
  QUOTE_STATUS_TRANSITIONS,
  type CatalogItem,
  type Quote,
  type QuoteLine,
  type QuoteLineSection,
  type QuoteStatus,
} from '@/lib/types';
import { computeQuoteMargin, computeQuoteTotals, groupQuoteLines } from '@/lib/quote-calc';
import LineRow from './LineRow';
import LinePicker from './LinePicker';

const fmt = (n: number) => n.toLocaleString('zh-TW');

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export default function QuoteEditor({
  quote,
  initialLines,
  initialCostByItemId,
}: {
  quote: Quote;
  initialLines: QuoteLine[];
  initialCostByItemId: Record<string, number | null>;
}) {
  const [lines, setLines] = useState<QuoteLine[]>(initialLines);
  const [costByItemId, setCostByItemId] = useState<Record<string, number | null>>(initialCostByItemId);
  const [clientName, setClientName] = useState(quote.client_name);
  const [projectName, setProjectName] = useState(quote.project_name ?? '');
  const [note, setNote] = useState(quote.note ?? '');
  const [siteId, setSiteId] = useState(quote.site_id ?? '');
  const [sites, setSites] = useState<Array<{ id: string; name: string }>>([]);
  const [status, setStatus] = useState<QuoteStatus>(quote.status);
  const [rationale, setRationale] = useState(quote.ai_rationale ?? '');
  const [needText, setNeedText] = useState(quote.need_text ?? '');

  const [headerBusy, setHeaderBusy] = useState(false);
  const [headerMsg, setHeaderMsg] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [manualBusy, setManualBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [newLineSection, setNewLineSection] = useState<QuoteLineSection>('器材');
  const [taxRate, setTaxRate] = useState(String(quote.tax_rate));
  const [taxBusy, setTaxBusy] = useState(false);
  const [taxMsg, setTaxMsg] = useState<string | null>(null);

  const [speechOn, setSpeechOn] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    setSpeechSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  useEffect(() => {
    fetch('/api/sites?active=1', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setSites(j.sites ?? []))
      .catch(() => {});
  }, []);

  const groups = useMemo(() => groupQuoteLines(lines), [lines]);
  const missing = groups.missingCount;
  const totals = useMemo(() => computeQuoteTotals(groups, Number(taxRate) || 0), [groups, taxRate]);
  const margin = useMemo(() => computeQuoteMargin(lines, costByItemId), [lines, costByItemId]);
  const canSend = lines.length > 0 && missing === 0;

  function upsertLine(l: QuoteLine) {
    setLines((prev) => prev.map((x) => (x.id === l.id ? l : x)));
  }
  function removeLine(id: string) {
    setLines((prev) => prev.filter((x) => x.id !== id));
  }

  async function saveHeader() {
    setHeaderMsg(null);
    if (!clientName.trim()) { setHeaderMsg('客戶名稱不可為空'); return; }
    setHeaderBusy(true);
    try {
      const res = await fetch(`/api/quotes/${quote.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: clientName.trim(),
          project_name: projectName.trim() || null,
          note: note.trim() || null,
          site_id: siteId || null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      setHeaderMsg(res.ok ? '已儲存' : (j.error ?? '儲存失敗'));
    } catch {
      setHeaderMsg('網路錯誤');
    } finally {
      setHeaderBusy(false);
    }
  }

  async function changeStatus(next: QuoteStatus) {
    setActionError(null);
    if (next === status) return;
    if (next === 'sent' && !canSend) {
      setActionError('尚有待設定售價或沒有明細,無法送出');
      return;
    }
    const prev = status;
    setStatus(next);
    try {
      const res = await fetch(`/api/quotes/${quote.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setActionError(j.error ?? '更新狀態失敗'); setStatus(prev); }
    } catch {
      setActionError('網路錯誤'); setStatus(prev);
    }
  }

  async function runSuggest() {
    setAiError(null);
    if (!needText.trim()) { setAiError('請先輸入需求描述'); return; }
    setAiBusy(true);
    try {
      const res = await fetch(`/api/quotes/${quote.id}/suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ need_text: needText.trim() }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setAiError(j.error ?? 'AI 建議失敗'); setAiBusy(false); return; }
      const newLines = (j.lines ?? []) as QuoteLine[];
      setLines((prev) => [...prev, ...newLines]);
      setRationale(typeof j.rationale === 'string' ? j.rationale : '');
    } catch (e) {
      setAiError(e instanceof Error ? e.message : '網路錯誤');
    } finally {
      setAiBusy(false);
    }
  }

  function toggleSpeech() {
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;
    if (speechOn && recRef.current) { recRef.current.stop(); return; }
    const rec = new Ctor();
    rec.lang = 'zh-TW';
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e) => {
      let text = '';
      for (let i = 0; i < e.results.length; i += 1) text += e.results[i][0].transcript;
      if (text) setNeedText((prev) => (prev ? `${prev} ${text}` : text));
    };
    rec.onend = () => { setSpeechOn(false); recRef.current = null; };
    rec.onerror = () => { setSpeechOn(false); recRef.current = null; };
    recRef.current = rec;
    setSpeechOn(true);
    rec.start();
  }

  async function addFromCatalog(item: CatalogItem) {
    setActionError(null);
    setPickerOpen(false);
    const res = await fetch(`/api/quotes/${quote.id}/lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add', line: { catalog_item_id: item.id, qty: 1, section: newLineSection } }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.line) { setActionError(j.error ?? '加入失敗'); return; }
    setLines((prev) => [...prev, j.line as QuoteLine]);
    setCostByItemId((prev) => ({ ...prev, [item.id]: item.cost_price_twd }));
  }

  async function addManual() {
    setActionError(null);
    setManualBusy(true);
    try {
      const res = await fetch(`/api/quotes/${quote.id}/lines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', line: { name: '新項目', qty: 1, section: newLineSection } }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.line) { setActionError(j.error ?? '新增失敗'); setManualBusy(false); return; }
      setLines((prev) => [...prev, j.line as QuoteLine]);
    } finally {
      setManualBusy(false);
    }
  }

  async function saveTaxRate() {
    setTaxMsg(null);
    const tr = Number(taxRate);
    if (!Number.isFinite(tr) || tr < 0 || tr > 1) { setTaxMsg('稅率必須是 0 到 1 之間的數字'); return; }
    setTaxBusy(true);
    try {
      const res = await fetch(`/api/quotes/${quote.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tax_rate: tr }),
      });
      const j = await res.json().catch(() => ({}));
      setTaxMsg(res.ok ? '已儲存' : (j.error ?? '儲存失敗'));
    } catch {
      setTaxMsg('網路錯誤');
    } finally {
      setTaxBusy(false);
    }
  }

  const inputCls = 'nm-input';

  return (
    <div className="space-y-5">
      <style>{`@media print { .print-hide { display: none !important; } body { background: #fff; } }`}</style>

      {/* 頂部:客戶/案件/狀態 */}
      <div className="rounded-2xl nm-raised p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>客戶名稱</label>
            <input value={clientName} onChange={(e) => setClientName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>案件名稱</label>
            <input value={projectName} onChange={(e) => setProjectName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>案場(選填 · 供之後報價↔實際毛利對照用)</label>
            <select value={siteId} onChange={(e) => setSiteId(e.target.value)} className={inputCls}>
              <option value="">— 不掛案場 —</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>備註(內部用,不出現在列印/匯出)</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 print-hide">
          <button onClick={saveHeader} disabled={headerBusy} className="nm-btn-solid text-[13px] disabled:opacity-50">
            {headerBusy ? '儲存中…' : '儲存基本資料'}
          </button>
          <div className="flex items-center gap-2 text-[13px]">
            <span style={{ color: 'var(--nm-text-secondary)' }}>狀態</span>
            <select
              value={status}
              onChange={(e) => changeStatus(e.target.value as QuoteStatus)}
              disabled={QUOTE_STATUS_TRANSITIONS[status].length === 0}
              className="nm-input"
              style={{ width: 'auto', minHeight: 36, padding: '4px 10px' }}
            >
              <option value={status}>{QUOTE_STATUS_LABEL[status]}(目前)</option>
              {QUOTE_STATUS_TRANSITIONS[status].map((s) => (
                <option key={s} value={s}>{QUOTE_STATUS_LABEL[s]}</option>
              ))}
            </select>
            {QUOTE_STATUS_TRANSITIONS[status].length === 0 && (
              <span className="text-xs" style={{ color: 'var(--nm-text-muted)' }}>已是終態,不可再變更</span>
            )}
          </div>
          {headerMsg && <span className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>{headerMsg}</span>}
          {actionError && <span className="text-[13px]" style={{ color: 'var(--nm-danger)' }}>{actionError}</span>}
        </div>
      </div>

      {/* AI 入口 */}
      <div className="rounded-2xl p-4 space-y-3 print-hide" style={{ background: 'rgba(140, 120, 200, 0.08)', border: '1px solid rgba(140, 120, 200, 0.3)' }}>
        <div className="flex items-center gap-2">
          <span className="font-semibold" style={{ color: 'var(--nm-text-primary)' }}>AI 選設備</span>
          <span className="text-xs" style={{ color: 'var(--nm-text-muted)' }}>AI 只建議品項與數量,價格一律來自價目表</span>
        </div>
        <textarea
          value={needText}
          onChange={(e) => setNeedText(e.target.value)}
          rows={3}
          placeholder="用一句話描述這個案子的需求(例:磐頂教會主堂要換一套喇叭+兩支無線麥)"
          className={inputCls}
        />
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={runSuggest} disabled={aiBusy} className="nm-btn-solid text-[13px] disabled:opacity-50">
            {aiBusy ? 'AI 思考中…' : '請 AI 建議設備配置'}
          </button>
          {speechSupported && (
            <button onClick={toggleSpeech} className={speechOn ? 'nm-danger text-[13px]' : 'nm-btn text-[13px]'}>
              {speechOn ? '● 錄音中,點此停止' : '🎤 語音輸入'}
            </button>
          )}
          {aiError && <span className="text-[13px]" style={{ color: 'var(--nm-danger)' }}>{aiError}</span>}
        </div>
        {rationale && (
          <div className="rounded-xl nm-inset px-3 py-2 text-[13px]">
            <span style={{ color: 'var(--nm-text-muted)' }}>AI 配置說明:</span> <span style={{ color: 'var(--nm-text-body)' }}>{rationale}</span>
          </div>
        )}
      </div>

      {/* 明細表:分區(器材/安裝) */}
      {([
        { key: '器材' as const, label: '器材', rows: groups.equipment, subtotal: groups.equipmentSubtotal },
        { key: '安裝' as const, label: '安裝', rows: groups.install, subtotal: groups.installSubtotal },
      ]).map((section) => (
        <div key={section.key} className="rounded-2xl nm-raised overflow-x-auto overflow-y-auto">
          <div className="px-3 pt-3 font-semibold text-[13px]" style={{ color: 'var(--nm-text-primary)' }}>{section.label}</div>
          <table className="w-full text-[13px]" style={{ minWidth: 1000, borderCollapse: 'collapse' }}>
            <thead style={{ background: 'rgba(20,20,24,0.92)' }}>
              <tr style={{ color: 'var(--nm-text-muted)' }}>
                <th className="text-left px-2 py-2 w-10 font-normal whitespace-nowrap">序</th>
                <th className="text-left px-3 py-2 font-normal whitespace-nowrap">名稱</th>
                <th className="text-left px-3 py-2 font-normal whitespace-nowrap">規格</th>
                <th className="text-right px-3 py-2 font-normal whitespace-nowrap">數量</th>
                <th className="text-left px-3 py-2 font-normal whitespace-nowrap">單位</th>
                <th className="text-right px-3 py-2 font-normal whitespace-nowrap">單價</th>
                <th className="text-right px-3 py-2 font-normal whitespace-nowrap">小計</th>
                <th className="text-right px-3 py-2 font-normal whitespace-nowrap print-hide">毛利%</th>
                <th className="text-left px-3 py-2 font-normal whitespace-nowrap print-hide">動作</th>
              </tr>
            </thead>
            <tbody>
              {section.rows.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-6 text-center whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>此區還沒有明細</td></tr>
              )}
              {section.rows.map((line, i) => (
                <LineRow
                  key={line.id}
                  line={line}
                  index={i}
                  quoteId={quote.id}
                  unitCost={line.catalog_item_id ? costByItemId[line.catalog_item_id] : undefined}
                  onChanged={upsertLine}
                  onDeleted={removeLine}
                />
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '1px solid var(--nm-border-hair)' }}>
                <td colSpan={6} className="px-3 py-2 text-right whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>{section.label}小計</td>
                <td className="px-3 py-2 text-right font-mono tabular whitespace-nowrap" style={{ color: 'var(--nm-text-body)' }}>${fmt(section.subtotal)}</td>
                <td className="print-hide" />
                <td className="print-hide" />
              </tr>
            </tfoot>
          </table>
        </div>
      ))}

      {/* 加行按鈕 */}
      <div className="flex flex-wrap items-center gap-3 print-hide">
        <button onClick={() => setPickerOpen(true)} className="nm-btn text-[13px]">從價目表加一項</button>
        <button onClick={addManual} disabled={manualBusy} className="nm-btn text-[13px] disabled:opacity-50">手動加一行</button>
        <div className="flex items-center gap-2 text-[13px]">
          <span style={{ color: 'var(--nm-text-secondary)' }}>新項目分區</span>
          <select
            value={newLineSection}
            onChange={(e) => setNewLineSection(e.target.value as QuoteLineSection)}
            className="nm-input"
            style={{ width: 'auto', minHeight: 36, padding: '4px 10px' }}
          >
            <option value="器材">器材</option>
            <option value="安裝">安裝</option>
          </select>
        </div>
      </div>

      {/* 總額 */}
      <div className="rounded-2xl nm-raised p-4 space-y-2">
        <div className="flex items-center justify-between text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>
          <span>器材小計</span><span>${fmt(groups.equipmentSubtotal)}</span>
        </div>
        <div className="flex items-center justify-between text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>
          <span>安裝小計</span><span>${fmt(groups.installSubtotal)}</span>
        </div>
        {lines.length > 0 && (
          <div className="flex items-center justify-between text-[13px] print-hide" style={{ color: 'var(--nm-text-muted)' }}>
            <span>
              毛利(僅內部可見,不含人事、不會出現在列印/匯出)
              {margin.coveredLines < margin.totalLines && (
                <span style={{ color: 'var(--nm-warning)' }}> · 僅 {margin.coveredLines}/{margin.totalLines} 項有進價資料</span>
              )}
            </span>
            <span>{margin.marginPct !== null ? `${margin.marginPct.toFixed(1)}%（$${fmt(margin.marginTwd)}）` : '—'}</span>
          </div>
        )}
        {missing > 0 ? (
          <div className="flex items-center justify-end">
            <span className="text-lg font-semibold" style={{ color: 'var(--nm-warning)' }}>尚有 {missing} 項待設定售價,無法送出</span>
          </div>
        ) : lines.length === 0 ? (
          <div className="flex items-center justify-end">
            <span style={{ color: 'var(--nm-text-secondary)' }}>尚無明細</span>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>
              <span>Total</span><span>${fmt(totals.total)}</span>
            </div>
            <div className="flex items-center justify-between text-[13px] print-hide" style={{ color: 'var(--nm-text-secondary)' }}>
              <span className="flex items-center gap-2">
                稅額(稅率
                <input
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                  onBlur={saveTaxRate}
                  disabled={taxBusy}
                  className="nm-input text-right"
                  style={{ width: 64, minHeight: 28, padding: '2px 6px' }}
                />
                )
              </span>
              <span>${fmt(totals.tax)}</span>
            </div>
            {taxMsg && <div className="text-right text-xs print-hide" style={{ color: 'var(--nm-text-muted)' }}>{taxMsg}</div>}
            <div className="flex items-center justify-between pt-1" style={{ borderTop: '1px solid var(--nm-border-hair)' }}>
              <span className="text-lg" style={{ color: 'var(--nm-text-body)' }}>總價</span>
              <span className="text-2xl font-semibold" style={{ color: 'var(--nm-text-primary)' }}>${fmt(totals.grandTotal)}</span>
            </div>
          </>
        )}
      </div>

      {/* 動作按鈕 */}
      <div className="flex flex-wrap items-center gap-3 print-hide">
        <a href={`/api/quotes/${quote.id}/export.csv`} className="nm-btn text-[13px]">匯出 CSV</a>
        <a href={`/boss/quotes/${quote.id}/print`} className="nm-btn text-[13px]">列印</a>
        <a href="/boss/quotes" className="ml-auto nm-btn text-[13px]">返回列表</a>
      </div>

      {pickerOpen && <LinePicker onPick={addFromCatalog} onClose={() => setPickerOpen(false)} />}
    </div>
  );
}
