'use client';

import { useMemo, useState } from 'react';
import {
  EQUIPMENT_CATEGORY_LABEL,
  type EquipmentCategory,
  type EquipmentStatus,
} from '@/lib/types';
import { formatLastMoved } from '@/lib/equipment-view';
import { PositionTrackSm } from '@/app/boss/equipment/_shared';

export interface StaffRow {
  id: string;
  name: string;
  brand: string | null;
  model_number: string | null;
  category: EquipmentCategory;
  quantity: number;
  unit: string;
  status: EquipmentStatus;
  siteName: string | null;
  lastMovedAt: string | null;
}

const FILTERS: { key: EquipmentStatus | 'all'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'in_storage', label: '庫房' },
  { key: 'on_site', label: '案場' },
  { key: 'in_repair', label: '維修' },
];

export default function StaffEquipmentBoard({ rows }: { rows: StaffRow[] }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<EquipmentStatus | 'all'>('all');

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length, in_storage: 0, on_site: 0, in_repair: 0 };
    for (const r of rows) c[r.status] = (c[r.status] || 0) + 1;
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    let out = rows;
    if (filter !== 'all') out = out.filter((r) => r.status === filter);
    const q = query.trim().toLowerCase();
    if (q) out = out.filter((r) => [r.name, r.brand, r.model_number].some((v) => (v || '').toLowerCase().includes(q)));
    return out;
  }, [rows, query, filter]);

  return (
    <div className="space-y-3">
      <div
        style={{ minHeight: 48, display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', borderRadius: 13 }}
        className="nm-inset"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6d6e73" strokeWidth={1.75} strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.6-3.6" />
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="找名稱、型號、序號"
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', font: '400 14px/1 "Noto Sans TC",sans-serif', color: 'var(--nm-text-body)' }}
        />
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              style={{
                minHeight: 48,
                padding: '0 13px',
                borderRadius: 999,
                font: '400 12.5px/1 "Noto Sans TC",sans-serif',
                background: active ? '#f0f0f2' : 'rgba(255,255,255,.07)',
                color: active ? '#17171a' : 'var(--nm-text-muted)',
                fontWeight: active ? 500 : 400,
                border: 'none',
              }}
            >
              {f.label} {counts[f.key] ?? 0}
            </button>
          );
        })}
      </div>

      <div className="text-xs" style={{ color: 'var(--nm-text-muted)' }}>共 {filtered.length} 筆</div>

      <ul className="grid grid-cols-1 gap-2">
        {filtered.length === 0 && (
          <li className="text-center py-8 text-[13px]" style={{ color: 'var(--nm-text-muted)' }}>沒有符合的設備</li>
        )}
        {filtered.map((r) => {
          const locationLine = r.status === 'on_site' ? `在${r.siteName || '(未知)'}` : r.status === 'in_repair' ? '維修中' : '在庫房';
          const locationColor = r.status === 'on_site' ? 'var(--nm-warning-glass-text)' : r.status === 'in_repair' ? 'var(--nm-danger-glass-text)' : 'var(--nm-text-body)';
          return (
            <li key={r.id} className="nm-raised rounded-2xl p-3.5" style={{ minHeight: 48 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 11 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: '500 15px/1.35 "Noto Sans TC",sans-serif', color: 'var(--nm-text-primary)' }}>{r.name}</div>
                  {r.model_number && (
                    <div style={{ font: '400 11.5px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace', color: 'var(--nm-text-muted)', marginTop: 4 }}>
                      {[r.brand, r.model_number].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </div>
                <div style={{ flex: 'none', paddingTop: 3 }}>
                  <PositionTrackSm status={r.status} />
                </div>
              </div>
              <div style={{ font: '400 13.5px/1.5 "Noto Sans TC",sans-serif', color: locationColor, marginBottom: 4 }}>{locationLine}</div>
              <div style={{ font: '400 12px/1.5 "Noto Sans TC",sans-serif', color: 'var(--nm-text-secondary)' }}>
                {r.quantity} {r.unit}{r.quantity > 1 ? ' 整批' : ''}　·　{formatLastMoved(r.status, r.lastMovedAt)}　·　{EQUIPMENT_CATEGORY_LABEL[r.category]}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
