'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  EQUIPMENT_STATUS_LABEL,
  type EquipmentStatus,
} from '@/lib/types';
import { validateMove } from '@/lib/equipment-validation';

interface Site { id: string; name: string; active: boolean }

interface Props {
  equipmentId: string;
  currentStatus: EquipmentStatus;
  currentSiteId: string | null;
}

const STATUSES: EquipmentStatus[] = ['in_storage', 'on_site', 'in_repair', 'retired'];

export default function MoveDialog({ equipmentId, currentStatus, currentSiteId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [toStatus, setToStatus] = useState<EquipmentStatus>(currentStatus);
  const [toSiteId, setToSiteId] = useState<string>(currentSiteId ?? '');
  const [notes, setNotes] = useState('');
  const [sites, setSites] = useState<Site[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch('/api/sites?active=1')
      .then((r) => r.json())
      .then((j) => { if (j.ok) setSites(j.sites || []); })
      .catch(() => {});
  }, [open]);

  const effectiveSiteId = toStatus === 'on_site' ? (toSiteId || null) : null;
  const clientErr = validateMove({
    to_status: toStatus,
    to_site_id: effectiveSiteId,
    current_status: currentStatus,
    current_site_id: currentSiteId,
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (clientErr) { setError(clientErr); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/equipment/${equipmentId}/move`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          to_status: toStatus,
          to_site_id: effectiveSiteId,
          notes: notes.trim() || null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || '移動失敗');
      setOpen(false);
      setNotes('');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '移動失敗');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); setToStatus(currentStatus); setToSiteId(currentSiteId ?? ''); setError(null); }}
        className="nm-btn-solid text-[13.5px]"
      >
        移動
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-md rounded-2xl nm-raised-lg p-6 space-y-4"
            style={{ background: 'rgba(24,24,28,0.75)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold" style={{ color: 'var(--nm-text-primary)' }}>移動設備</h2>
              <button onClick={() => setOpen(false)} className="nm-focus" style={{ color: 'var(--nm-text-muted)' }}>✕</button>
            </div>

            <form onSubmit={onSubmit} className="space-y-3">
              <fieldset className="space-y-2">
                <legend className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>目的狀態</legend>
                <div className="grid grid-cols-2 gap-2">
                  {STATUSES.map((s) => (
                    <label
                      key={s}
                      className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer text-[13px] ${toStatus === s ? 'nm-inset-sm' : 'nm-flat'}`}
                      style={{ color: toStatus === s ? 'var(--nm-text-primary)' : 'var(--nm-text-secondary)' }}
                    >
                      <input
                        type="radio"
                        name="to_status"
                        value={s}
                        checked={toStatus === s}
                        onChange={() => { setToStatus(s); if (s !== 'on_site') setToSiteId(''); }}
                      />
                      <span>{EQUIPMENT_STATUS_LABEL[s]}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {toStatus === 'on_site' && (
                <label className="block space-y-1">
                  <span className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>案場 *</span>
                  <select value={toSiteId} onChange={(e) => setToSiteId(e.target.value)} className="nm-input w-full text-[13px]">
                    <option value="">— 請選擇 —</option>
                    {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
              )}

              <label className="block space-y-1">
                <span className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>備註</span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="例:音圈燒了送 XX 維修中"
                  className="nm-input w-full text-[13px]"
                />
              </label>

              {(error || clientErr) && (
                <div className="rounded-xl nm-inset p-2 text-[13px]" style={{ color: 'var(--nm-danger)' }}>
                  {error || clientErr}
                </div>
              )}

              <div className="flex gap-3 justify-end pt-1">
                <button type="button" onClick={() => setOpen(false)} className="nm-btn text-[13px]">
                  取消
                </button>
                <button type="submit" disabled={submitting || !!clientErr} className="nm-btn-solid text-[13.5px]">
                  {submitting ? '移動中…' : '確認移動'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
