'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  EQUIPMENT_STATUS_LABEL,
  type EquipmentStatus,
} from '@/lib/types';
import { formatLastMoved } from '@/lib/equipment-view';
import { PositionTrackSm, BatchBadge } from './_shared';

export interface BoardRow {
  id: string;
  name: string;
  brand: string | null;
  model_number: string | null;
  serial_number: string | null;
  quantity: number;
  unit: string;
  status: EquipmentStatus;
  siteId: string | null;
  siteName: string | null;
  notes: string | null;
  lastMovedAt: string | null;
  isStuck: boolean;
}

export interface DistSeg {
  status: EquipmentStatus;
  label: string;
  count: number;
}

export interface AttentionTile {
  key: string;
  label: string;
  count: number | null; // null = 資料未接上
  unitLabel: string;
  caption: string;
  severity: 'danger' | 'warning' | 'neutral';
}

const GRID_COLS = '1fr 96px 108px 150px 128px 96px';
const ROWS_PER_GROUP = 8;

function tileColors(severity: AttentionTile['severity'], hasData: boolean) {
  if (!hasData) {
    return { border: 'rgba(224,122,122,.3)', bg: 'rgba(224,122,122,.06)', label: 'var(--nm-danger-glass-text)', num: 'var(--nm-danger-glass-text)' };
  }
  if (severity === 'danger') {
    return { border: 'rgba(224,122,122,.3)', bg: 'rgba(224,122,122,.06)', label: 'var(--nm-danger-glass-text)', num: 'var(--nm-danger-glass-text)' };
  }
  if (severity === 'warning') {
    return { border: 'rgba(217,181,107,.28)', bg: 'rgba(217,181,107,.06)', label: 'var(--nm-warning-glass-text)', num: 'var(--nm-warning-glass-text)' };
  }
  return { border: 'rgba(255,255,255,.09)', bg: 'rgba(8,8,10,.4)', label: 'var(--nm-text-muted)', num: 'var(--nm-text-primary)' };
}

function AttentionTileCard({ tile }: { tile: AttentionTile }) {
  const hasData = tile.count !== null;
  const c = tileColors(tile.severity, hasData);
  return (
    <div style={{ borderRadius: 16, border: `1px solid ${c.border}`, background: c.bg, padding: '15px 17px' }}>
      <div style={{ font: '400 11.5px/1 "Noto Sans TC",sans-serif', color: c.label, marginBottom: 11 }}>{tile.label}</div>
      {hasData ? (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 9 }}>
          <span className="tabular-nums" style={{ font: '600 26px/1 ui-monospace,SFMono-Regular,Menlo,monospace', color: c.num }}>{tile.count}</span>
          <span style={{ font: '400 12px/1 "Noto Sans TC",sans-serif', color: 'var(--nm-text-secondary)' }}>{tile.unitLabel}</span>
        </div>
      ) : (
        <div style={{ font: '600 15px/1 "Noto Sans TC",sans-serif', color: 'var(--nm-danger-glass-text)', marginBottom: 9 }}>資料未接上</div>
      )}
      <div style={{ font: '400 12px/1.5 "Noto Sans TC",sans-serif', color: 'var(--nm-text-secondary)' }}>{tile.caption}</div>
    </div>
  );
}

function statusMeta(status: EquipmentStatus) {
  if (status === 'in_repair') return { text: 'var(--nm-danger-glass-text)', bg: 'rgba(224,122,122,.07)' };
  if (status === 'on_site') return { text: 'var(--nm-warning-glass-text)', bg: 'rgba(217,181,107,.06)' };
  return { text: 'var(--nm-text-body)', bg: 'rgba(255,255,255,.03)' };
}

interface Group {
  key: string;
  headerLabel: string;
  headerMeta: string;
  siteId: string | null;
  status: EquipmentStatus;
  rows: BoardRow[];
}

function buildGroups(rows: BoardRow[]): Group[] {
  const repair: BoardRow[] = [];
  const storage: BoardRow[] = [];
  const bySite = new Map<string, { name: string; rows: BoardRow[] }>();

  for (const r of rows) {
    if (r.status === 'in_repair') repair.push(r);
    else if (r.status === 'in_storage') storage.push(r);
    else if (r.status === 'on_site') {
      const key = r.siteId || '(未知)';
      if (!bySite.has(key)) bySite.set(key, { name: r.siteName || '(未知案場)', rows: [] });
      bySite.get(key)!.rows.push(r);
    }
  }

  const groups: Group[] = [];
  if (repair.length > 0) {
    const maxDays = repair.reduce((max, r) => {
      if (!r.lastMovedAt) return max;
      const d = Math.floor((Date.now() - new Date(r.lastMovedAt).getTime()) / 86400000);
      return Math.max(max, d);
    }, 0);
    groups.push({
      key: 'repair',
      headerLabel: '維修中',
      headerMeta: maxDays > 0 ? `最久 ${maxDays} 天` : '',
      siteId: null,
      status: 'in_repair',
      rows: repair,
    });
  }
  const siteEntries = [...bySite.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name, 'zh-Hant'));
  for (const [siteId, v] of siteEntries) {
    groups.push({
      key: `site:${siteId}`,
      headerLabel: `在案場　${v.name}`,
      headerMeta: '',
      siteId,
      status: 'on_site',
      rows: v.rows,
    });
  }
  if (storage.length > 0) {
    groups.push({
      key: 'storage',
      headerLabel: '庫房',
      headerMeta: '可調度',
      siteId: null,
      status: 'in_storage',
      rows: storage,
    });
  }
  return groups;
}

function ActionPill({ status }: { status: EquipmentStatus }) {
  return (
    <span
      style={{
        minHeight: 34,
        display: 'flex',
        alignItems: 'center',
        padding: '0 13px',
        borderRadius: 11,
        font: '400 12px/1 "Noto Sans TC",sans-serif',
        ...(status === 'on_site'
          ? { background: '#f0f0f2', color: '#17171a', fontWeight: 500 }
          : { background: 'rgba(40,40,46,.4)', border: '1px solid rgba(255,255,255,.2)', color: 'var(--nm-text-body)' }),
      }}
    >
      {status === 'on_site' ? '調回' : '移動'}
    </span>
  );
}

function EquipmentRow({ row }: { row: BoardRow }) {
  const statusColor = row.isStuck ? 'var(--nm-danger-glass-text)' : 'var(--nm-text-secondary)';
  const brandLine = [row.brand, row.model_number, row.serial_number ? `SN ${row.serial_number}` : 'SN 缺'].filter(Boolean).join(' · ');
  const locationLine = row.status === 'on_site' ? `在${row.siteName || '(未知)'}` : row.status === 'in_repair' ? '維修中' : '在庫房';

  return (
    <Link href={`/boss/equipment/${row.id}`} className="nm-focus block" style={{ textDecoration: 'none' }}>
      {/* 桌機：6 欄 grid（§3-4），不橫向捲動 */}
      <div
        className="hidden md:grid"
        style={{
          gridTemplateColumns: GRID_COLS,
          columnGap: 16,
          alignItems: 'center',
          padding: '13px 20px',
          borderBottom: '1px solid rgba(255,255,255,.05)',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ font: '400 13.5px/1.35 "Noto Sans TC",sans-serif', color: 'var(--nm-text-primary)' }}>{row.name}</div>
          <div style={{ font: '400 11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace', color: 'var(--nm-text-muted)', marginTop: 3 }}>{brandLine}</div>
        </div>
        <PositionTrackSm status={row.status} />
        <span className="tabular-nums" style={{ textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
          <span style={{ font: '400 13px/1 ui-monospace,SFMono-Regular,Menlo,monospace', color: 'var(--nm-text-body)' }}>{row.quantity} {row.unit}</span>
          {row.quantity > 1 && <BatchBadge />}
        </span>
        <span style={{ font: '400 12.5px/1.4 "Noto Sans TC",sans-serif', color: statusColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {row.notes || '—'}
        </span>
        <span className="tabular-nums" style={{ textAlign: 'right', font: '400 12px/1 ui-monospace,SFMono-Regular,Menlo,monospace', color: statusColor }}>
          {formatLastMoved(row.status, row.lastMovedAt)}
        </span>
        <span style={{ justifySelf: 'end' }}>
          <ActionPill status={row.status} />
        </span>
      </div>

      {/* 手機：14c 卡片——第一行位置與案場，第二行數量與誰帶的；目標高度 ≥48px */}
      <div
        className="grid md:hidden"
        style={{
          padding: 14,
          borderBottom: '1px solid rgba(255,255,255,.05)',
          minHeight: 48,
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: '500 15px/1.35 "Noto Sans TC",sans-serif', color: 'var(--nm-text-primary)' }}>{row.name}</div>
            <div style={{ font: '400 11.5px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace', color: 'var(--nm-text-muted)', marginTop: 4 }}>{brandLine}</div>
          </div>
          <div style={{ flex: 'none', paddingTop: 3 }}>
            <div style={{ display: 'flex', gap: 3 }}>
              <PositionTrackSm status={row.status} />
            </div>
          </div>
        </div>
        <div style={{ font: '400 13.5px/1.5 "Noto Sans TC",sans-serif', color: statusColor }}>{locationLine}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ font: '400 12px/1.5 "Noto Sans TC",sans-serif', color: 'var(--nm-text-secondary)' }}>
            {row.quantity} {row.unit}{row.quantity > 1 ? '整批' : ''}　·　{formatLastMoved(row.status, row.lastMovedAt)}
          </span>
          <ActionPill status={row.status} />
        </div>
      </div>
    </Link>
  );
}

function GroupBlock({ group }: { group: Group }) {
  const [expanded, setExpanded] = useState(false);
  const meta = statusMeta(group.status);
  const visible = expanded ? group.rows : group.rows.slice(0, ROWS_PER_GROUP);
  const remaining = group.rows.length - visible.length;

  return (
    <div>
      <div
        style={{
          padding: '11px 20px',
          background: meta.bg,
          borderTop: '1px solid rgba(255,255,255,.07)',
          borderBottom: '1px solid rgba(255,255,255,.07)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <span style={{ font: '500 12px/1 "Noto Sans TC",sans-serif', color: meta.text }}>{group.headerLabel}</span>
        <span className="tabular-nums" style={{ font: '400 11.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace', color: 'var(--nm-text-muted)' }}>
          {group.rows.length} 件
        </span>
        {group.headerMeta && (
          <span style={{ marginLeft: 'auto', font: '400 11.5px/1 "Noto Sans TC",sans-serif', color: 'var(--nm-text-muted)' }}>{group.headerMeta}</span>
        )}
        {group.siteId && (
          <Link
            href={`/boss/projects/${group.siteId}`}
            className="nm-focus"
            style={{ marginLeft: group.headerMeta ? 0 : 'auto', font: '400 11.5px/1 "Noto Sans TC",sans-serif', color: 'var(--nm-text-muted)', textDecoration: 'none' }}
          >
            查看案場 ›
          </Link>
        )}
      </div>
      <div
        className="hidden md:grid"
        style={{
          gridTemplateColumns: GRID_COLS,
          columnGap: 16,
          padding: '9px 20px',
          borderBottom: '1px solid rgba(255,255,255,.05)',
          font: '400 10px/1 "Noto Sans TC",sans-serif',
          letterSpacing: '.16em',
          color: 'var(--nm-text-muted)',
          textTransform: 'uppercase',
        }}
      >
        <span>名稱　品牌型號</span><span>位置</span><span style={{ textAlign: 'right' }}>數量</span><span>在哪／狀況</span><span style={{ textAlign: 'right' }}>最後移動</span><span style={{ textAlign: 'right' }}>動作</span>
      </div>
      {visible.map((r) => (
        <EquipmentRow key={r.id} row={r} />
      ))}
      {remaining > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="nm-focus"
          style={{
            width: '100%',
            padding: '13px 20px',
            textAlign: 'center',
            font: '400 12.5px/1 "Noto Sans TC",sans-serif',
            color: 'var(--nm-text-secondary)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          {group.headerLabel.replace(/　.*/, '')}還有 {remaining} 件　展開
        </button>
      )}
    </div>
  );
}

export default function EquipmentBoard({
  rows,
  dist,
  attentionTiles,
  distError,
  totalCount,
  needAttentionCount,
}: {
  rows: BoardRow[];
  dist: DistSeg[];
  attentionTiles: AttentionTile[];
  distError: boolean;
  totalCount: number;
  needAttentionCount: number;
}) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<EquipmentStatus | null>(null);

  const filtered = useMemo(() => {
    let out = rows;
    if (statusFilter) out = out.filter((r) => r.status === statusFilter);
    const q = query.trim().toLowerCase();
    if (q) {
      out = out.filter((r) =>
        [r.name, r.brand, r.model_number, r.serial_number].some((v) => (v || '').toLowerCase().includes(q)),
      );
    }
    return out;
  }, [rows, query, statusFilter]);

  const groups = useMemo(() => buildGroups(filtered), [filtered]);
  const totalDist = dist.reduce((s, d) => s + d.count, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '20px 32px', borderBottom: '1px solid rgba(255,255,255,.05)', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 'none', minWidth: 'max-content' }}>
          <div style={{ font: '400 11px/1 "Noto Sans TC",sans-serif', letterSpacing: '.16em', color: 'var(--nm-text-muted)', marginBottom: 6, textTransform: 'uppercase' }}>設備</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <span style={{ font: '600 22px/1 "Noto Sans TC",sans-serif', color: 'var(--nm-text-primary)', letterSpacing: '-.01em' }}>設備庫存</span>
            <span style={{ whiteSpace: 'nowrap', font: '400 13.5px/1 "Noto Sans TC",sans-serif', color: 'var(--nm-text-secondary)' }}>
              {totalCount} 件在冊　·　<span style={{ color: 'var(--nm-warning)' }}>{needAttentionCount} 件要注意</span>
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }} className="sm:w-auto">
        <div
          style={{
            minHeight: 48,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '0 14px',
            borderRadius: 12,
          }}
          className="nm-inset w-full sm:w-[300px] sm:min-h-[40px]"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6d6e73" strokeWidth={1.75} strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.6-3.6" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="名稱、型號、序號　邊打邊找"
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', font: '400 12.5px/1 "Noto Sans TC",sans-serif', color: 'var(--nm-text-body)' }}
          />
        </div>
        <Link href="/boss/equipment/new" className="nm-btn-solid sm:min-h-[40px]" style={{ minHeight: 48, display: 'flex', alignItems: 'center', padding: '0 16px', font: '500 12.5px/1 "Noto Sans TC",sans-serif', whiteSpace: 'nowrap' }}>
          ＋ 新增設備
        </Link>
        </div>
      </div>

      {distError ? (
        <div className="rounded-xl nm-inset m-6 p-3 text-[13px]" style={{ color: 'var(--nm-danger)' }}>分佈資料讀取失敗</div>
      ) : totalDist === 0 ? (
        <div style={{ padding: '18px 32px', borderBottom: '1px solid rgba(255,255,255,.05)', font: '400 13px/1.6 "Noto Sans TC",sans-serif', color: 'var(--nm-text-muted)' }}>
          還沒有登記任何設備　<Link href="/boss/equipment/new" style={{ color: 'var(--nm-text-body)', textDecoration: 'underline' }}>＋ 新增設備</Link>
        </div>
      ) : (
        <div style={{ padding: '18px 32px', borderBottom: '1px solid rgba(255,255,255,.05)', background: 'rgba(8,8,10,.28)' }}>
          <div style={{ display: 'flex', gap: 3, height: 16, marginBottom: 12 }}>
            {dist.filter((d) => d.count > 0).map((d) => {
              const widthPct = (d.count / totalDist) * 100;
              const style: React.CSSProperties = { width: `${widthPct}%`, borderRadius: 2, padding: 0, cursor: d.status === 'retired' ? 'default' : 'pointer' };
              if (d.status === 'in_storage') style.background = 'rgba(255,255,255,.4)';
              else if (d.status === 'on_site') { style.border = '1.5px solid var(--nm-warning)'; style.background = 'rgba(217,181,107,.14)'; }
              else if (d.status === 'in_repair') { style.border = '1.5px solid var(--nm-danger)'; style.background = 'rgba(224,122,122,.14)'; }
              else style.background = 'rgba(255,255,255,.07)';
              return (
                <button
                  key={d.status}
                  type="button"
                  disabled={d.status === 'retired'}
                  data-dist-seg
                  data-status={d.status}
                  data-count={d.count}
                  onClick={() => d.status !== 'retired' && setStatusFilter((prev) => (prev === d.status ? null : d.status))}
                  style={style}
                  title={`${d.label} ${d.count}`}
                />
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 26, font: '400 12.5px/1 "Noto Sans TC",sans-serif', flexWrap: 'wrap' }}>
            {dist.filter((d) => d.count > 0).map((d) => {
              const dotStyle: React.CSSProperties = { width: 9, height: 9, display: 'block' };
              let numColor = '#f0f0f2';
              if (d.status === 'in_storage') dotStyle.background = 'rgba(255,255,255,.4)';
              else if (d.status === 'on_site') { dotStyle.border = '1.5px solid #d9b56b'; dotStyle.background = 'rgba(217,181,107,.14)'; numColor = '#e7ca8c'; }
              else if (d.status === 'in_repair') { dotStyle.border = '1.5px solid #e07a7a'; dotStyle.background = 'rgba(224,122,122,.14)'; numColor = '#e5a0a0'; }
              else { dotStyle.background = 'rgba(255,255,255,.07)'; numColor = '#8a8b90'; }
              return (
                <button
                  key={d.status}
                  type="button"
                  disabled={d.status === 'retired'}
                  onClick={() => setStatusFilter((prev) => (prev === d.status ? null : d.status))}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, color: d.status === 'retired' ? '#8a8b90' : '#e4e4e7', background: 'none', border: 'none', cursor: d.status === 'retired' ? 'default' : 'pointer', padding: 0, font: 'inherit' }}
                >
                  <span style={dotStyle} />
                  {d.label} <span className="tabular-nums" style={{ fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace', color: numColor }}>{d.count}</span>
                </button>
              );
            })}
            <span style={{ marginLeft: 'auto', color: 'var(--nm-text-faint)', fontSize: 11.5 }}>實心＝在手上，空心描邊＝不在庫房。點任一段只看那一段。</span>
          </div>
        </div>
      )}

      <div style={{ padding: '24px 32px 32px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ font: '400 10.5px/1 "Noto Sans TC",sans-serif', letterSpacing: '.18em', color: 'var(--nm-text-muted)', textTransform: 'uppercase' }}>要注意的</span>
            <span style={{ font: '400 11.5px/1 "Noto Sans TC",sans-serif', color: 'var(--nm-text-faint)' }}>會影響下一個案子的情況</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3" style={{ gap: 14 }}>
            {attentionTiles.map((t) => (
              <AttentionTileCard key={t.key} tile={t} />
            ))}
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ font: '400 10.5px/1 "Noto Sans TC",sans-serif', letterSpacing: '.18em', color: 'var(--nm-text-muted)', textTransform: 'uppercase' }}>依位置分組</span>
            {statusFilter && (
              <button
                type="button"
                onClick={() => setStatusFilter(null)}
                className="nm-focus"
                style={{ font: '400 12px/1 "Noto Sans TC",sans-serif', color: 'var(--nm-text-muted)', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer' }}
              >
                清除篩選（{EQUIPMENT_STATUS_LABEL[statusFilter]}）
              </button>
            )}
          </div>

          <div data-equipment-list style={{ borderRadius: 16, border: '1px solid rgba(255,255,255,.09)', background: 'rgba(8,8,10,.4)', overflow: 'hidden' }}>
            {groups.length === 0 && (
              <div style={{ padding: '24px 20px', textAlign: 'center', font: '400 13px/1 "Noto Sans TC",sans-serif', color: 'var(--nm-text-muted)' }}>
                沒有符合條件的設備
              </div>
            )}
            {groups.map((g) => (
              <GroupBlock key={g.key} group={g} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
