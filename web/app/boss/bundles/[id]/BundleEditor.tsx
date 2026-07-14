'use client';

import { useMemo, useState } from 'react';
import type { BundleLine, BundleTemplate, CatalogItem, QuoteLineSection } from '@/lib/types';
import LinePicker from '../../quotes/[id]/LinePicker';
import BundleLineRow from './BundleLineRow';

export default function BundleEditor({
  bundle,
  initialLines,
}: {
  bundle: BundleTemplate;
  initialLines: BundleLine[];
}) {
  const [lines, setLines] = useState<BundleLine[]>(initialLines);
  const [name, setName] = useState(bundle.name);
  const [applicableTo, setApplicableTo] = useState(bundle.applicable_to ?? '');
  const [note, setNote] = useState(bundle.note ?? '');

  const [headerBusy, setHeaderBusy] = useState(false);
  const [headerMsg, setHeaderMsg] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [manualBusy, setManualBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [newLineSection, setNewLineSection] = useState<QuoteLineSection>('器材');
  const [deactivateBusy, setDeactivateBusy] = useState(false);

  const groups = useMemo(() => {
    const equipment: BundleLine[] = [];
    const install: BundleLine[] = [];
    for (const l of lines) {
      if (l.section === '安裝') install.push(l);
      else equipment.push(l);
    }
    return { equipment, install };
  }, [lines]);

  function upsertLine(l: BundleLine) {
    setLines((prev) => prev.map((x) => (x.id === l.id ? l : x)));
  }
  function removeLine(id: string) {
    setLines((prev) => prev.filter((x) => x.id !== id));
  }

  async function saveHeader() {
    setHeaderMsg(null);
    if (!name.trim()) { setHeaderMsg('套組名稱不可為空'); return; }
    setHeaderBusy(true);
    try {
      const res = await fetch(`/api/bundles/${bundle.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          applicable_to: applicableTo.trim() || null,
          note: note.trim() || null,
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

  async function addFromCatalog(item: CatalogItem) {
    setActionError(null);
    setPickerOpen(false);
    const res = await fetch(`/api/bundles/${bundle.id}/lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add', line: { catalog_item_id: item.id, qty: 1, section: newLineSection } }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.line) { setActionError(j.error ?? '加入失敗'); return; }
    setLines((prev) => [...prev, j.line as BundleLine]);
  }

  async function addManual() {
    setActionError(null);
    setManualBusy(true);
    try {
      const res = await fetch(`/api/bundles/${bundle.id}/lines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', line: { name: '新項目', qty: 1, section: newLineSection } }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.line) { setActionError(j.error ?? '新增失敗'); setManualBusy(false); return; }
      setLines((prev) => [...prev, j.line as BundleLine]);
    } finally {
      setManualBusy(false);
    }
  }

  async function deactivate() {
    if (!window.confirm('確定要停用此套組嗎?停用後不會再出現在報價單選單中。')) return;
    setActionError(null);
    setDeactivateBusy(true);
    try {
      const res = await fetch(`/api/bundles/${bundle.id}`, { method: 'DELETE' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setActionError(j.error ?? '停用失敗'); setDeactivateBusy(false); return; }
      window.location.href = '/boss/bundles';
    } catch {
      setActionError('網路錯誤');
      setDeactivateBusy(false);
    }
  }

  const inputCls = 'nm-input';

  return (
    <div className="space-y-5">
      {/* 頂部:套組基本資料 */}
      <div className="rounded-2xl nm-raised p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>套組名稱</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>適用情境</label>
            <input value={applicableTo} onChange={(e) => setApplicableTo(e.target.value)} className={inputCls} placeholder="例:100坪以下教會主堂" />
          </div>
        </div>
        <div>
          <label className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>備註</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={inputCls} placeholder="例:低頻不足時另加 KW181 x2" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={saveHeader} disabled={headerBusy} className="nm-btn-solid text-[13px] disabled:opacity-50">
            {headerBusy ? '儲存中…' : '儲存基本資料'}
          </button>
          {headerMsg && <span className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>{headerMsg}</span>}
          {actionError && <span className="text-[13px]" style={{ color: 'var(--nm-danger)' }}>{actionError}</span>}
        </div>
      </div>

      {/* 明細表:分區(器材/安裝) */}
      {([
        { key: '器材' as const, label: '器材', rows: groups.equipment },
        { key: '安裝' as const, label: '安裝', rows: groups.install },
      ]).map((section) => (
        <div key={section.key} className="rounded-2xl nm-raised overflow-x-auto overflow-y-auto">
          <div className="px-3 pt-3 font-semibold text-[13px]" style={{ color: 'var(--nm-text-primary)' }}>{section.label}</div>
          <table className="w-full text-[13px]" style={{ minWidth: 800, borderCollapse: 'collapse' }}>
            <thead style={{ background: 'rgba(20,20,24,0.92)' }}>
              <tr style={{ color: 'var(--nm-text-muted)' }}>
                <th className="text-left px-2 py-2 w-10 font-normal whitespace-nowrap">序</th>
                <th className="text-left px-3 py-2 font-normal whitespace-nowrap">名稱</th>
                <th className="text-left px-3 py-2 font-normal whitespace-nowrap">規格</th>
                <th className="text-right px-3 py-2 font-normal whitespace-nowrap">數量</th>
                <th className="text-left px-3 py-2 font-normal whitespace-nowrap">單位</th>
                <th className="text-left px-3 py-2 font-normal whitespace-nowrap">動作</th>
              </tr>
            </thead>
            <tbody>
              {section.rows.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>此區還沒有明細</td></tr>
              )}
              {section.rows.map((line, i) => (
                <BundleLineRow key={line.id} line={line} index={i} bundleId={bundle.id} onChanged={upsertLine} onDeleted={removeLine} />
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {/* 加行按鈕 */}
      <div className="flex flex-wrap items-center gap-3">
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

      {/* 動作 */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={deactivate}
          disabled={deactivateBusy}
          className="nm-danger text-[13px] disabled:opacity-50"
        >
          {deactivateBusy ? '停用中…' : '停用此套組'}
        </button>
        <a href="/boss/bundles" className="ml-auto nm-btn text-[13px]">返回列表</a>
      </div>

      {pickerOpen && <LinePicker onPick={addFromCatalog} onClose={() => setPickerOpen(false)} />}
    </div>
  );
}
