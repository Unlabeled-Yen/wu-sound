import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/supabase';
import {
  EQUIPMENT_STATUS_LABEL,
  type EquipmentCategory,
  type EquipmentStatus,
} from '@/lib/types';
import { REPAIR_STUCK_DAYS, SITE_STUCK_DAYS, daysSince, formatLastMoved } from '@/lib/equipment-view';
import EquipmentBoard, { type AttentionTile, type BoardRow, type DistSeg } from './EquipmentBoard';

export const dynamic = 'force-dynamic';

const DIST_ORDER: EquipmentStatus[] = ['in_storage', 'on_site', 'in_repair', 'retired'];

interface RawRow {
  id: string;
  name: string;
  brand: string | null;
  model_number: string | null;
  serial_number: string | null;
  category: EquipmentCategory;
  quantity: number;
  unit: string;
  status: EquipmentStatus;
  current_site_id: string | null;
  notes: string | null;
  created_at: string;
  sites: { name: string } | null;
}

export default async function BossEquipmentPage() {
  const sb = getSupabaseAdmin();

  const [countsRes, rowsRes] = await Promise.all([
    sb.from('equipment').select('status'),
    sb
      .from('equipment')
      .select(
        'id, name, brand, model_number, serial_number, category, quantity, unit, status, current_site_id, notes, created_at, sites:current_site_id(name)',
      )
      .neq('status', 'retired')
      .limit(500),
  ]);

  const distError = !!countsRes.error;
  const listError = !!rowsRes.error;

  const statusCounts: Record<EquipmentStatus, number> = { in_storage: 0, on_site: 0, in_repair: 0, retired: 0 };
  if (!distError) {
    for (const r of (countsRes.data as { status: EquipmentStatus }[]) || []) {
      statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
    }
  }
  const dist: DistSeg[] = DIST_ORDER.map((status) => ({
    status,
    label: EQUIPMENT_STATUS_LABEL[status] === '淘汰' ? '已淘汰' : status === 'in_storage' ? '庫房' : status === 'on_site' ? '在案場' : '維修中',
    count: statusCounts[status] || 0,
  }));

  const rawRows: RawRow[] = listError ? [] : ((rowsRes.data as unknown as RawRow[]) || []);
  const ids = rawRows.map((r) => r.id);

  const lastMovedMap = new Map<string, string>();
  let movementError = false;
  if (ids.length > 0) {
    const mv = await sb
      .from('equipment_movements')
      .select('equipment_id, moved_at')
      .in('equipment_id', ids)
      .order('moved_at', { ascending: false });
    if (mv.error) {
      movementError = true;
    } else {
      for (const m of (mv.data as { equipment_id: string; moved_at: string }[]) || []) {
        if (!lastMovedMap.has(m.equipment_id)) lastMovedMap.set(m.equipment_id, m.moved_at);
      }
    }
  }

  const boardRows: BoardRow[] = rawRows.map((r) => {
    const lastMovedAt = lastMovedMap.get(r.id) ?? null;
    const d = daysSince(lastMovedAt);
    const isStuck =
      (r.status === 'in_repair' && d !== null && d >= REPAIR_STUCK_DAYS) ||
      (r.status === 'on_site' && d !== null && d >= SITE_STUCK_DAYS);
    return {
      id: r.id,
      name: r.name,
      brand: r.brand,
      model_number: r.model_number,
      serial_number: r.serial_number,
      quantity: r.quantity,
      unit: r.unit,
      status: r.status,
      siteId: r.current_site_id,
      siteName: r.sites?.name ?? null,
      notes: r.notes,
      lastMovedAt,
      isStuck,
    };
  });

  // 要注意的：送修沒下文
  const repairStuck = boardRows.filter((r) => r.status === 'in_repair' && r.isStuck);
  repairStuck.sort((a, b) => (a.lastMovedAt || '').localeCompare(b.lastMovedAt || ''));
  const worstRepair = repairStuck[0];
  const repairTile: AttentionTile = {
    key: 'repair-stuck',
    label: '送修沒下文',
    count: listError || movementError ? null : repairStuck.length,
    unitLabel: `件超過 ${REPAIR_STUCK_DAYS} 天`,
    caption: worstRepair
      ? `${[worstRepair.brand, worstRepair.model_number].filter(Boolean).join(' ')}　${formatLastMoved(worstRepair.status, worstRepair.lastMovedAt)}送出`
      : '目前沒有卡住的維修',
    severity: repairStuck.length > 0 ? 'danger' : 'neutral',
  };

  // 要注意的：在同一案場超過 30 天
  const siteStuck = boardRows.filter((r) => r.status === 'on_site' && r.isStuck);
  const siteTile: AttentionTile = {
    key: 'site-stuck',
    label: '在同一案場超過 30 天',
    count: listError || movementError ? null : siteStuck.length,
    unitLabel: '件該確認',
    caption: siteStuck.length > 0 ? '是常駐安裝，還是忘了帶回？' : '都在合理範圍內',
    severity: siteStuck.length > 0 ? 'warning' : 'neutral',
  };

  // 要注意的：缺序號
  const missingSerial = boardRows.filter((r) => !r.serial_number);
  const serialTile: AttentionTile = {
    key: 'missing-serial',
    label: '資料不全',
    count: listError ? null : missingSerial.length,
    unitLabel: '件缺序號',
    caption: missingSerial.length > 0 ? '出保與理賠會用到　·　現在補' : '序號都齊全',
    severity: 'neutral',
  };

  const totalInRegister = boardRows.length;
  const needAttentionCount = repairStuck.length + siteStuck.length + missingSerial.length;

  return (
    <div className="rounded-2xl nm-raised overflow-hidden">
      {(listError || movementError) && (
        <div className="rounded-xl nm-inset m-6 p-3 text-[13px]" style={{ color: 'var(--nm-danger)' }}>
          讀取失敗:{rowsRes.error?.message}
        </div>
      )}

      <EquipmentBoard
        rows={boardRows}
        dist={dist}
        attentionTiles={[repairTile, siteTile, serialTile]}
        distError={distError}
        totalCount={totalInRegister}
        needAttentionCount={needAttentionCount}
      />
    </div>
  );
}
