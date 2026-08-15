'use client';

import { useState } from 'react';
import type { SiteNote } from '@/lib/types';
import { addSiteNote, togglePinNote, promoteToChecklist, deleteSiteNote } from './actions';

interface Props {
  siteId: string;
  notes: SiteNote[];
  zones: string[];
}

export default function SiteKnowledge({ siteId, notes, zones }: Props) {
  const [expandedZones, setExpandedZones] = useState<Set<string>>(() => {
    const s = new Set<string>();
    const pinZones = notes.filter(n => n.is_pinned).map(n => n.zone);
    for (const z of pinZones) s.add(z);
    if (s.size === 0 && zones.length > 0) s.add(zones[0]);
    return s;
  });
  const [showForm, setShowForm] = useState(false);

  const pinnedCount = notes.filter(n => n.is_pinned).length;
  const pinned = notes.filter(n => n.is_pinned);

  const grouped = new Map<string, SiteNote[]>();
  for (const n of notes) {
    const key = n.zone || '(未分區)';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(n);
  }

  function toggleZone(z: string) {
    setExpandedZones(prev => {
      const next = new Set(prev);
      if (next.has(z)) next.delete(z);
      else next.add(z);
      return next;
    });
  }

  return (
    <div className="nm-raised rounded-2xl overflow-hidden">
      <div
        className="flex items-center justify-between px-3 py-2.5"
        style={{ background: 'rgba(20,20,24,0.92)', borderBottom: '1px solid var(--nm-border-hair)' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium" style={{ color: 'var(--nm-text-primary)' }}>場地知識</span>
          <span className="text-[12px] tabular-nums" style={{ color: 'var(--nm-text-muted)' }}>{notes.length}</span>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(f => !f)}
          className="nm-btn text-[12px]"
          style={{ padding: '3px 10px', minHeight: 'auto' }}
        >
          + 新增
        </button>
      </div>

      {/* Pinned strip */}
      {pinned.length > 0 && (
        <div className="px-3 py-2" style={{ background: 'rgba(217,181,107,0.04)', borderBottom: '1px solid var(--nm-border-hair)' }}>
          <div className="text-[10.5px] uppercase tracking-[.18em] mb-1.5" style={{ color: 'var(--nm-warning-glass-text)' }}>
            釘選 {pinnedCount}/5
          </div>
          <div className="flex flex-col gap-1">
            {pinned.map(n => (
              <div key={n.id} className="flex items-start gap-1.5 text-[12px] leading-[1.6]">
                <span className="shrink-0 mt-[3px]" style={{ color: 'var(--nm-warning)' }}>📌</span>
                <span style={{ color: 'var(--nm-text-body)' }}>{n.content}</span>
                {n.zone && <span className="shrink-0 text-[11px] nm-pill nm-pill-neutral ml-auto">{n.zone}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <form
          action={addSiteNote}
          className="px-3 py-2.5 flex flex-col gap-2"
          style={{ borderBottom: '1px solid var(--nm-border-hair)' }}
          onSubmit={() => setShowForm(false)}
        >
          <input type="hidden" name="site_id" value={siteId} />
          <div className="flex gap-2">
            <input
              name="zone"
              placeholder="廳別/區域(選填)"
              className="nm-input text-[12px]"
              style={{ width: 140 }}
              list="zone-suggestions"
            />
            <datalist id="zone-suggestions">
              {zones.map(z => <option key={z} value={z} />)}
            </datalist>
            <input
              name="content"
              required
              placeholder="寫下經驗筆記..."
              className="nm-input text-[12px] flex-1"
            />
          </div>
          <div className="flex justify-end">
            <button type="submit" className="nm-btn-solid text-[12px]" style={{ padding: '4px 14px', minHeight: 'auto' }}>儲存</button>
          </div>
        </form>
      )}

      {/* Grouped by zone */}
      {notes.length === 0 ? (
        <div className="text-[13px] py-6 text-center" style={{ color: 'var(--nm-text-faint)' }}>
          還沒有場地知識。點「+ 新增」記下案場的經驗。
        </div>
      ) : (
        <div>
          {Array.from(grouped.entries()).map(([zone, zoneNotes]) => {
            const expanded = expandedZones.has(zone);
            return (
              <div key={zone} style={{ borderBottom: '1px solid var(--nm-border-hair)' }}>
                <button
                  type="button"
                  onClick={() => toggleZone(zone)}
                  className="w-full flex items-center justify-between px-3 py-2 text-[12px] nm-lift"
                  style={{ color: 'var(--nm-text-secondary)' }}
                >
                  <span className="font-medium">{zone}</span>
                  <span className="flex items-center gap-1.5">
                    <span className="tabular-nums" style={{ color: 'var(--nm-text-muted)' }}>{zoneNotes.length}</span>
                    <span style={{ fontSize: 10, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▼</span>
                  </span>
                </button>
                {expanded && (
                  <div className="px-3 pb-2 flex flex-col gap-1.5">
                    {zoneNotes.map(n => (
                      <NoteRow key={n.id} note={n} siteId={siteId} pinnedCount={pinnedCount} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NoteRow({ note, siteId, pinnedCount }: { note: SiteNote; siteId: string; pinnedCount: number }) {
  return (
    <div className="flex items-start gap-2 group text-[12px] leading-[1.6]">
      <div className="flex-1 min-w-0" style={{ color: 'var(--nm-text-body)' }}>
        {note.content}
        {note.is_checklist && (
          <span className="ml-1.5 text-[10.5px] nm-pill" style={{ color: 'var(--nm-success-glass-text)', background: 'rgba(126,207,157,0.08)', borderColor: 'rgba(126,207,157,0.26)' }}>
            檢查表
          </span>
        )}
      </div>
      <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <form action={togglePinNote} className="inline">
          <input type="hidden" name="note_id" value={note.id} />
          <input type="hidden" name="site_id" value={siteId} />
          <input type="hidden" name="is_pinned" value={String(note.is_pinned)} />
          <button
            type="submit"
            className="text-[11px] px-1.5 py-0.5 rounded nm-lift"
            style={{ color: note.is_pinned ? 'var(--nm-warning)' : 'var(--nm-text-muted)' }}
            title={note.is_pinned ? '取消釘選' : (pinnedCount >= 5 ? '已達釘選上限' : '釘選')}
            disabled={!note.is_pinned && pinnedCount >= 5}
          >
            📌
          </button>
        </form>
        {!note.is_checklist && (
          <form action={promoteToChecklist} className="inline">
            <input type="hidden" name="note_id" value={note.id} />
            <input type="hidden" name="site_id" value={siteId} />
            <button
              type="submit"
              className="text-[11px] px-1.5 py-0.5 rounded"
              style={{ color: '#fff', background: 'var(--nm-danger)', borderRadius: 6 }}
              title="升級成檢查表項目"
            >
              升為檢查表
            </button>
          </form>
        )}
        <form action={deleteSiteNote} className="inline">
          <input type="hidden" name="note_id" value={note.id} />
          <input type="hidden" name="site_id" value={siteId} />
          <button
            type="submit"
            className="text-[11px] px-1.5 py-0.5 rounded nm-lift"
            style={{ color: 'var(--nm-text-faint)' }}
            title="刪除"
          >
            ✕
          </button>
        </form>
      </div>
    </div>
  );
}
