'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  QUOTE_STATUS_LABEL,
  type CatalogItem,
  type Quote,
  type QuoteLine,
  type QuoteStatus,
} from '@/lib/types';
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

export default function QuoteEditor({ quote, initialLines }: { quote: Quote; initialLines: QuoteLine[] }) {
  const [lines, setLines] = useState<QuoteLine[]>(initialLines);
  const [clientName, setClientName] = useState(quote.client_name);
  const [projectName, setProjectName] = useState(quote.project_name ?? '');
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

  const [speechOn, setSpeechOn] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    setSpeechSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  const missing = useMemo(() => lines.filter((l) => l.unit_price_twd === null).length, [lines]);
  const total = useMemo(
    () => lines.reduce((s, l) => (l.unit_price_twd !== null ? s + l.qty * l.unit_price_twd : s), 0),
    [lines],
  );
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
        body: JSON.stringify({ client_name: clientName.trim(), project_name: projectName.trim() || null }),
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
      body: JSON.stringify({ action: 'add', line: { catalog_item_id: item.id, qty: 1 } }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.line) { setActionError(j.error ?? '加入失敗'); return; }
    setLines((prev) => [...prev, j.line as QuoteLine]);
  }

  async function addManual() {
    setActionError(null);
    setManualBusy(true);
    try {
      const res = await fetch(`/api/quotes/${quote.id}/lines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', line: { name: '新項目', qty: 1 } }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.line) { setActionError(j.error ?? '新增失敗'); setManualBusy(false); return; }
      setLines((prev) => [...prev, j.line as QuoteLine]);
    } finally {
      setManualBusy(false);
    }
  }

  const inputCls = 'w-full border border-neutral-300 dark:border-neutral-700 rounded px-3 py-2 bg-white dark:bg-neutral-900';

  return (
    <div className="space-y-5">
      <style>{`@media print { .print-hide { display: none !important; } body { background: #fff; } }`}</style>

      {/* 頂部:客戶/案件/狀態 */}
      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-neutral-500">客戶名稱</label>
            <input value={clientName} onChange={(e) => setClientName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-sm text-neutral-500">案件名稱</label>
            <input value={projectName} onChange={(e) => setProjectName(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 print-hide">
          <button onClick={saveHeader} disabled={headerBusy} className="px-3 py-1.5 rounded bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 disabled:opacity-50 text-sm">
            {headerBusy ? '儲存中…' : '儲存基本資料'}
          </button>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-neutral-500">狀態</span>
            <select value={status} onChange={(e) => changeStatus(e.target.value as QuoteStatus)} className="border border-neutral-300 dark:border-neutral-700 rounded px-2 py-1.5 bg-white dark:bg-neutral-900">
              {(['draft', 'sent', 'won', 'lost'] as QuoteStatus[]).map((s) => (
                <option key={s} value={s}>{QUOTE_STATUS_LABEL[s]}</option>
              ))}
            </select>
          </div>
          {headerMsg && <span className="text-sm text-neutral-500">{headerMsg}</span>}
          {actionError && <span className="text-sm text-red-600">{actionError}</span>}
        </div>
      </div>

      {/* AI 入口 */}
      <div className="rounded-lg border border-violet-200 dark:border-violet-900/50 bg-violet-50/50 dark:bg-violet-950/20 p-4 space-y-3 print-hide">
        <div className="flex items-center gap-2">
          <span className="font-semibold">AI 選設備</span>
          <span className="text-xs text-neutral-500">AI 只建議品項與數量,價格一律來自品項庫</span>
        </div>
        <textarea
          value={needText}
          onChange={(e) => setNeedText(e.target.value)}
          rows={3}
          placeholder="用一句話描述這個案子的需求(例:磐頂教會主堂要換一套喇叭+兩支無線麥)"
          className={inputCls}
        />
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={runSuggest} disabled={aiBusy} className="px-4 py-2 rounded bg-violet-600 text-white disabled:opacity-50">
            {aiBusy ? 'AI 思考中…' : '請 AI 建議設備配置'}
          </button>
          {speechSupported && (
            <button onClick={toggleSpeech} className={`px-3 py-2 rounded border text-sm ${speechOn ? 'bg-rose-600 text-white border-rose-600' : 'border-neutral-300 dark:border-neutral-700'}`}>
              {speechOn ? '● 錄音中,點此停止' : '🎤 語音輸入'}
            </button>
          )}
          {aiError && <span className="text-sm text-red-600">{aiError}</span>}
        </div>
        {rationale && (
          <div className="rounded border border-violet-200 dark:border-violet-900/50 bg-white/60 dark:bg-neutral-900/60 px-3 py-2 text-sm">
            <span className="text-neutral-500">AI 配置說明:</span> {rationale}
          </div>
        )}
      </div>

      {/* 明細表 */}
      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-x-auto bg-white dark:bg-neutral-900">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-950 text-neutral-500">
            <tr>
              <th className="text-left px-2 py-2 w-10">序</th>
              <th className="text-left px-3 py-2">名稱</th>
              <th className="text-left px-3 py-2">規格</th>
              <th className="text-right px-3 py-2">數量</th>
              <th className="text-left px-3 py-2">單位</th>
              <th className="text-right px-3 py-2">單價</th>
              <th className="text-right px-3 py-2">小計</th>
              <th className="text-left px-3 py-2 print-hide">動作</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-neutral-500">還沒有明細,用上方 AI 建議或手動加一行</td></tr>
            )}
            {lines.map((line, i) => (
              <LineRow key={line.id} line={line} index={i} quoteId={quote.id} onChanged={upsertLine} onDeleted={removeLine} />
            ))}
          </tbody>
        </table>
      </div>

      {/* 加行按鈕 */}
      <div className="flex flex-wrap gap-3 print-hide">
        <button onClick={() => setPickerOpen(true)} className="px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 text-sm">從品項庫加一項</button>
        <button onClick={addManual} disabled={manualBusy} className="px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 text-sm disabled:opacity-50">手動加一行</button>
      </div>

      {/* 總額 */}
      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 flex items-center justify-end gap-4">
        {missing > 0 ? (
          <span className="text-lg font-semibold text-amber-600 dark:text-amber-400">尚有 {missing} 項待設定售價,無法送出</span>
        ) : lines.length === 0 ? (
          <span className="text-neutral-500">尚無明細</span>
        ) : (
          <span className="text-lg">總計 <span className="text-2xl font-semibold">${fmt(total)}</span></span>
        )}
      </div>

      {/* 動作按鈕 */}
      <div className="flex flex-wrap items-center gap-3 print-hide">
        <a href={`/api/quotes/${quote.id}/export.csv`} className="px-4 py-2 rounded border border-neutral-300 dark:border-neutral-700">匯出 CSV</a>
        <button onClick={() => window.print()} className="px-4 py-2 rounded border border-neutral-300 dark:border-neutral-700">列印</button>
        <button
          onClick={() => changeStatus('sent')}
          disabled={!canSend || status === 'sent'}
          title={!canSend ? '尚有待設定售價或沒有明細,無法送出' : ''}
          className="px-4 py-2 rounded bg-emerald-600 text-white disabled:opacity-50"
        >
          標記已送出
        </button>
        <a href="/boss/quotes" className="ml-auto px-4 py-2 rounded border border-neutral-300 dark:border-neutral-700">返回列表</a>
      </div>

      {pickerOpen && <LinePicker onPick={addFromCatalog} onClose={() => setPickerOpen(false)} />}
    </div>
  );
}
