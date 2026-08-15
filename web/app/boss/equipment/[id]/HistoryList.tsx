'use client';

import { useState } from 'react';
import { formatEquipmentLocation, type EquipmentStatus } from '@/lib/types';
import { formatDateTime } from '@/lib/equipment-view';
import { PatchCableHistory } from '../_shared';

export interface HistoryItem {
  id: number;
  moved_at: string;
  from_status: EquipmentStatus;
  to_status: EquipmentStatus;
  from_site_name: string | null;
  to_site_name: string | null;
  mover_name: string | null;
  notes: string | null;
}

const VISIBLE = 4;

export default function HistoryList({ items }: { items: HistoryItem[] }) {
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) {
    return <div style={{ font: '400 13px/1 "Noto Sans TC",sans-serif', color: 'var(--nm-text-muted)' }}>目前沒有移動記錄</div>;
  }

  const visible = expanded ? items : items.slice(0, VISIBLE);
  const remaining = items.length - visible.length;

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {visible.map((m, i) => {
          const { date, time } = formatDateTime(m.moved_at);
          return (
            <div key={m.id} style={{ display: 'flex', gap: 16, padding: '13px 0', borderTop: '1px solid rgba(255,255,255,.07)', borderBottom: i === visible.length - 1 ? '1px solid rgba(255,255,255,.07)' : undefined }}>
              <span style={{ flex: 'none', width: 76, font: '400 11px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace', color: 'var(--nm-text-muted)' }}>
                {date}<br />{time}
              </span>
              <PatchCableHistory from={m.from_status} to={m.to_status} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: '400 13px/1.5 "Noto Sans TC",sans-serif', color: 'var(--nm-text-primary)' }}>
                  {formatEquipmentLocation(m.from_status, m.from_site_name)}
                  {' → '}
                  {formatEquipmentLocation(m.to_status, m.to_site_name)}
                </div>
                <div style={{ font: '400 12px/1.5 "Noto Sans TC",sans-serif', color: 'var(--nm-text-secondary)', marginTop: 2 }}>
                  {m.mover_name || '(未知)'}
                  {m.notes ? `　·　備註：${m.notes}` : ''}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {remaining > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="nm-focus"
          style={{ marginTop: 14, font: '400 12px/1 "Noto Sans TC",sans-serif', color: 'var(--nm-text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          還有 {remaining} 次　展開
        </button>
      )}
    </>
  );
}
