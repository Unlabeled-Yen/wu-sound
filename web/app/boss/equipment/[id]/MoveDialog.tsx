'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  EQUIPMENT_STATUS_LABEL,
  type EquipmentStatus,
} from '@/lib/types';
import { validateMove } from '@/lib/equipment-validation';
import { PatchCableDialog } from '../_shared';

interface Site { id: string; name: string; active: boolean }

interface Props {
  equipmentId: string;
  currentStatus: EquipmentStatus;
  currentSiteId: string | null;
  quantity: number;
  unit: string;
  trigger?: (open: () => void) => React.ReactNode;
}

const SLOTS: { status: EquipmentStatus; label: string }[] = [
  { status: 'in_storage', label: '庫房' },
  { status: 'on_site', label: '在案場' },
  { status: 'in_repair', label: '維修中' },
  { status: 'retired', label: '已淘汰' },
];

export default function MoveDialog({ equipmentId, currentStatus, currentSiteId, quantity, unit, trigger }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [toStatus, setToStatus] = useState<EquipmentStatus | null>(null);
  const [toSiteId, setToSiteId] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [sites, setSites] = useState<Site[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retireArmed, setRetireArmed] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch('/api/sites?active=1')
      .then((r) => r.json())
      .then((j) => { if (j.ok) setSites(j.sites || []); })
      .catch(() => {});
  }, [open]);

  function reset() {
    setToStatus(null);
    setToSiteId('');
    setNotes('');
    setError(null);
    setRetireArmed(false);
  }

  function openDialog() {
    reset();
    setOpen(true);
  }

  const effectiveSiteId = toStatus === 'on_site' ? (toSiteId || null) : null;
  const clientErr = useMemo(() => {
    if (!toStatus) return '請選擇要移到哪個孔位';
    return validateMove({
      to_status: toStatus,
      to_site_id: effectiveSiteId,
      current_status: currentStatus,
      current_site_id: currentSiteId,
    });
  }, [toStatus, effectiveSiteId, currentStatus, currentSiteId]);

  async function doSubmit() {
    if (!toStatus) return;
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
      reset();
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '移動失敗');
    } finally {
      setSubmitting(false);
    }
  }

  function onConfirmClick() {
    if (toStatus === 'retired' && !retireArmed) {
      setRetireArmed(true);
      return;
    }
    void doSubmit();
  }

  return (
    <>
      {trigger ? trigger(openDialog) : (
        <button type="button" onClick={openDialog} className="nm-btn-solid text-[13.5px]">
          移動
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-[400px] rounded-2xl overflow-hidden"
            style={{ background: 'rgba(24,24,28,.86)', border: '1px solid rgba(255,255,255,.2)', boxShadow: '0 24px 70px -28px rgba(0,0,0,.9)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ font: '600 15px/1 "Noto Sans TC",sans-serif', color: 'var(--nm-text-primary)' }}>移動設備</span>
              <button onClick={() => setOpen(false)} className="nm-focus" style={{ font: '400 13px/1 "Noto Sans TC",sans-serif', color: 'var(--nm-text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ padding: '18px 20px 20px' }}>
              <div style={{ font: '400 10.5px/1 "Noto Sans TC",sans-serif', letterSpacing: '.18em', color: 'var(--nm-text-muted)', textTransform: 'uppercase', marginBottom: 14 }}>
                從哪裡　到哪裡
              </div>

              <PatchCableDialog from={currentStatus} to={toStatus ?? currentStatus} />

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 9, marginBottom: 16 }}>
                {SLOTS.map((slot) => {
                  const isCurrent = slot.status === currentStatus;
                  const isSelected = slot.status === toStatus;
                  const isRetireSlot = slot.status === 'retired';
                  let style: React.CSSProperties = {
                    minHeight: 48,
                    borderRadius: 12,
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 14px',
                    font: '400 13.5px/1 "Noto Sans TC",sans-serif',
                    cursor: isCurrent ? 'default' : 'pointer',
                  };
                  if (isSelected) {
                    style = { ...style, background: '#26262b', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.05)', color: 'var(--nm-text-primary)', fontWeight: 500 };
                  } else if (isRetireSlot) {
                    style = { ...style, background: 'rgba(224,122,122,.08)', border: '1px solid rgba(224,122,122,.34)', color: 'var(--nm-danger-glass-text)' };
                  } else {
                    style = { ...style, background: 'rgba(40,40,46,.4)', border: '1px solid rgba(255,255,255,.2)', color: 'var(--nm-text-body)' };
                  }
                  return (
                    <button
                      key={slot.status}
                      type="button"
                      disabled={isCurrent}
                      onClick={() => { setToStatus(slot.status); setRetireArmed(false); if (slot.status !== 'on_site') setToSiteId(''); }}
                      style={style}
                    >
                      {slot.label}
                      {isCurrent && <span style={{ fontSize: 11, color: 'var(--nm-text-muted)', marginLeft: 8 }}>目前</span>}
                      {!isCurrent && isRetireSlot && <span style={{ fontSize: 11, color: 'var(--nm-text-muted)', marginLeft: 8 }}>兩步確認</span>}
                    </button>
                  );
                })}
              </div>

              {toStatus === 'on_site' && (
                <label className="block space-y-1" style={{ marginBottom: 16 }}>
                  <span style={{ font: '400 12.5px/1 "Noto Sans TC",sans-serif', color: 'var(--nm-text-secondary)' }}>案場 *</span>
                  <select value={toSiteId} onChange={(e) => setToSiteId(e.target.value)} className="nm-input w-full text-[13px]">
                    <option value="">— 請選擇 —</option>
                    {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
              )}

              {toStatus === 'retired' && (
                <div style={{ borderRadius: 12, background: 'rgba(8,8,10,.5)', border: '1px solid rgba(255,255,255,.1)', padding: '11px 13px', marginBottom: 16, font: '400 12px/1.6 "Noto Sans TC",sans-serif', color: 'var(--nm-text-secondary)' }}>
                  選「已淘汰」會斷開跳線並要求兩步確認——那是終態，之後不能再移回來。
                </div>
              )}

              {quantity > 1 && (
                <div style={{ font: '400 12px/1.6 "Noto Sans TC",sans-serif', color: 'var(--nm-text-secondary)', marginBottom: 14 }}>
                  這台設備共 {quantity} {unit}，整批一起移動，不支援部分調度。
                </div>
              )}

              <div style={{ font: '400 12.5px/1 "Noto Sans TC",sans-serif', color: 'var(--nm-text-secondary)', marginBottom: 9 }}>備註</div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="例:音圈燒了送 XX 維修中"
                className="nm-input w-full text-[13px]"
                style={{ minHeight: 76, marginBottom: 16 }}
              />

              {(error || (clientErr && toStatus)) && (
                <div className="rounded-xl nm-inset p-2 text-[13px] mb-3" style={{ color: 'var(--nm-danger)' }}>
                  {error || clientErr}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setOpen(false)} className="nm-btn text-[13px]" style={{ minHeight: 44 }}>
                  取消
                </button>
                <button
                  type="button"
                  onClick={onConfirmClick}
                  disabled={submitting || !!clientErr}
                  className="nm-btn-solid text-[13.5px]"
                  style={{ minHeight: 44 }}
                >
                  {submitting ? '移動中…' : toStatus === 'retired' ? (retireArmed ? '再按一次確認淘汰' : '確認淘汰') : '確認移動'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
