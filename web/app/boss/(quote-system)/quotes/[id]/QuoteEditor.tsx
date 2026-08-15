'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type CatalogItem,
  type Quote,
  type QuoteLine,
  type QuoteLineSection,
  type QuoteStatus,
} from '@/lib/types';
import { computeQuoteMargin, computeQuoteTotals, groupQuoteLines } from '@/lib/quote-calc';
import { QuoteHeader } from './QuoteHeader';
import { QuoteAiBar, QuoteAiResultBanner } from './QuoteAiBar';
import { QuoteSection } from './QuoteSection';
import { QuoteDecisionPanel, type FirstMissing } from './QuoteDecisionPanel';
import LinePicker from './LinePicker';

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

const AUTOSAVE_DEBOUNCE_MS = 800;
const JUST_ADDED_FADE_MS = 30000;

// 報價單當一份文件:左邊連續區域(表頭→AI條→分區明細→加行列),右邊 sticky
// 決策欄。State 沿用原本的 lines/costByItemId/status/taxRate 等,新增
// lastSavedAt/saveError(取代 headerBusy/headerMsg 的按鈕流程)、showMargin、
// justAdded(AI 插入後「剛加入 N 項」標記用)。
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
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [rationale, setRationale] = useState(quote.ai_rationale ?? '');
  const [needText, setNeedText] = useState(quote.need_text ?? '');

  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [manualBusy, setManualBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [newLineSection, setNewLineSection] = useState<QuoteLineSection>('器材');
  const [taxRate, setTaxRate] = useState(String(quote.tax_rate));
  const [taxBusy, setTaxBusy] = useState(false);
  const [showMargin, setShowMargin] = useState(false);
  const [justAdded, setJustAdded] = useState<string[]>([]);

  const [speechOn, setSpeechOn] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const missingRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const justAddedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // 表頭自動儲存:debounce 800ms,不需要按鈕。失敗就地變紅字(見 QuoteHeader),不彈窗。
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    const t = setTimeout(async () => {
      setSaveError(null);
      try {
        const res = await fetch(`/api/quotes/${quote.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_name: clientName.trim() || quote.client_name,
            project_name: projectName.trim() || null,
            note: note.trim() || null,
            site_id: siteId || null,
          }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) { setSaveError(j.error ?? '儲存失敗'); return; }
        setLastSavedAt(new Date());
      } catch {
        setSaveError('網路錯誤');
      }
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientName, projectName, note, siteId]);

  const groups = useMemo(() => groupQuoteLines(lines), [lines]);
  const missing = groups.missingCount;
  const totals = useMemo(() => computeQuoteTotals(groups, Number(taxRate) || 0), [groups, taxRate]);
  const margin = useMemo(() => computeQuoteMargin(lines, costByItemId), [lines, costByItemId]);
  const canSend = lines.length > 0 && missing === 0;

  const firstMissing: FirstMissing | null = useMemo(() => {
    const eqIdx = groups.equipment.findIndex((l) => l.unit_price_twd === null);
    if (eqIdx >= 0) return { sectionLabel: '器材', rowNumber: eqIdx + 1, lineId: groups.equipment[eqIdx].id };
    const inIdx = groups.install.findIndex((l) => l.unit_price_twd === null);
    if (inIdx >= 0) return { sectionLabel: '安裝', rowNumber: inIdx + 1, lineId: groups.install[inIdx].id };
    return null;
  }, [groups]);

  function upsertLine(l: QuoteLine) {
    setLines((prev) => prev.map((x) => (x.id === l.id ? l : x)));
  }
  function removeLine(id: string) {
    setLines((prev) => prev.filter((x) => x.id !== id));
  }

  async function changeStatus(next: QuoteStatus) {
    setStatusError(null);
    if (next === status) return;
    if (next === 'sent' && !canSend) {
      setStatusError('尚有待設定售價或沒有明細,無法送出');
      return;
    }
    setStatusBusy(true);
    const prev = status;
    setStatus(next);
    try {
      const res = await fetch(`/api/quotes/${quote.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setStatusError(j.error ?? '更新狀態失敗'); setStatus(prev); }
    } catch {
      setStatusError('網路錯誤'); setStatus(prev);
    } finally {
      setStatusBusy(false);
    }
  }

  function markJustAdded(ids: string[]) {
    setJustAdded(ids);
    if (justAddedTimer.current) clearTimeout(justAddedTimer.current);
    justAddedTimer.current = setTimeout(() => setJustAdded([]), JUST_ADDED_FADE_MS);
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
      markJustAdded(newLines.map((l) => l.id));
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
    const tr = Number(taxRate);
    if (!Number.isFinite(tr) || tr < 0 || tr > 1) return;
    setTaxBusy(true);
    try {
      await fetch(`/api/quotes/${quote.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tax_rate: tr }),
      });
    } finally {
      setTaxBusy(false);
    }
  }

  // 阻擋卡跳轉:不用 scrollIntoView(容易連 sticky 決策欄一起捲、或捲過頭出視野),
  // 改成手動算最近的可捲動祖先容器,調整它的 scrollTop。
  function jumpToMissing() {
    const el = firstMissing ? missingRefs.current[firstMissing.lineId] : null;
    if (!el) return;
    let node: HTMLElement | null = el.parentElement;
    let scrollParent: HTMLElement | null = null;
    while (node) {
      const cs = getComputedStyle(node);
      if (/(auto|scroll)/.test(cs.overflowY) && node.scrollHeight > node.clientHeight) { scrollParent = node; break; }
      node = node.parentElement;
    }
    const targetTop = el.getBoundingClientRect().top;
    if (scrollParent) {
      const containerTop = scrollParent.getBoundingClientRect().top;
      scrollParent.scrollTop += (targetTop - containerTop) - 120;
    } else {
      window.scrollTo({ top: window.scrollY + targetTop - 120, behavior: 'smooth' });
    }
    el.focus();
  }

  return (
    <div className="flex flex-col lg:flex-row gap-5 items-start">
      <style>{`@media print { .print-hide { display: none !important; } body { background: #fff; } }`}</style>

      <div className="flex-1 min-w-0 rounded-[20px] nm-raised overflow-hidden">
        <QuoteHeader
          clientName={clientName} setClientName={setClientName}
          projectName={projectName} setProjectName={setProjectName}
          siteId={siteId} setSiteId={setSiteId} sites={sites}
          note={note} setNote={setNote}
          createdAt={quote.created_at} lastSavedAt={lastSavedAt} saveError={saveError}
        />

        <QuoteAiBar
          needText={needText} setNeedText={setNeedText} onSuggest={runSuggest} busy={aiBusy} error={aiError}
          speechSupported={speechSupported} speechOn={speechOn} onToggleSpeech={toggleSpeech}
        />
        <QuoteAiResultBanner count={justAdded.length} rationale={rationale} />

        <QuoteSection
          title="器材" rows={groups.equipment} subtotal={groups.equipmentSubtotal}
          missingCount={groups.equipment.filter((l) => l.unit_price_twd === null).length}
          quoteId={quote.id} costByItemId={costByItemId} onChanged={upsertLine} onDeleted={removeLine}
          showMargin={showMargin} onToggleMargin={() => setShowMargin((v) => !v)} showMarginToggle
          missingRowRef={(lineId, elm) => { missingRefs.current[lineId] = elm; }}
        />
        <QuoteSection
          title="安裝" rows={groups.install} subtotal={groups.installSubtotal}
          missingCount={groups.install.filter((l) => l.unit_price_twd === null).length}
          quoteId={quote.id} costByItemId={costByItemId} onChanged={upsertLine} onDeleted={removeLine}
          showMargin={showMargin}
          missingRowRef={(lineId, elm) => { missingRefs.current[lineId] = elm; }}
        />

        <div className="print-hide flex flex-wrap items-center gap-3" style={{ padding: '18px 26px 24px' }}>
          <button type="button" onClick={() => setPickerOpen(true)} className="nm-btn text-[13px]">＋ 從價目表加一項</button>
          <button type="button" onClick={addManual} disabled={manualBusy} className="text-[13px] disabled:opacity-50" style={{ color: 'var(--nm-text-secondary)' }}>手動加一行</button>
          <div className="flex-1" />
          <div className="flex items-center gap-2 text-[11.5px]" style={{ color: 'var(--nm-text-faint)' }}>
            新項目分區
            <select
              value={newLineSection}
              onChange={(e) => setNewLineSection(e.target.value as QuoteLineSection)}
              className="bg-transparent outline-none"
              style={{ color: 'var(--nm-text-secondary)' }}
            >
              <option value="器材">器材</option>
              <option value="安裝">安裝</option>
            </select>
          </div>
          {actionError && <span className="text-[13px] w-full" style={{ color: 'var(--nm-danger)' }}>{actionError}</span>}
        </div>
      </div>

      <QuoteDecisionPanel
        status={status} onChangeStatus={changeStatus} statusBusy={statusBusy} statusError={statusError}
        equipmentSubtotal={groups.equipmentSubtotal} installSubtotal={groups.installSubtotal} total={totals.total}
        taxRate={taxRate} setTaxRate={setTaxRate} onSaveTaxRate={saveTaxRate} taxBusy={taxBusy}
        tax={totals.tax} grandTotal={totals.grandTotal}
        missing={missing} firstMissing={firstMissing} onJumpToMissing={jumpToMissing}
        canSend={canSend} onSend={() => changeStatus('sent')} sendBusy={statusBusy}
        marginPct={margin.marginPct} marginTwd={margin.marginTwd} coveredLines={margin.coveredLines} totalLines={margin.totalLines}
        printHref={`/boss/quotes/${quote.id}/print`} csvHref={`/api/quotes/${quote.id}/export.csv`}
      />

      {pickerOpen && <LinePicker onPick={addFromCatalog} onClose={() => setPickerOpen(false)} />}
    </div>
  );
}
