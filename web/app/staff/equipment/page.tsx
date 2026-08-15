import { getSupabaseAdmin } from '@/lib/supabase';
import {
  type EquipmentCategory,
  type EquipmentStatus,
} from '@/lib/types';
import StaffEquipmentBoard, { type StaffRow } from './StaffEquipmentBoard';

export const dynamic = 'force-dynamic';

interface RawRow {
  id: string;
  name: string;
  brand: string | null;
  model_number: string | null;
  category: EquipmentCategory;
  quantity: number;
  unit: string;
  status: EquipmentStatus;
  current_site_id: string | null;
  sites: { name: string } | null;
}

export default async function StaffEquipmentPage() {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('equipment')
    .select('id, name, brand, model_number, category, quantity, unit, status, current_site_id, sites:current_site_id(name)')
    .neq('status', 'retired')
    .limit(500);

  const rawRows: RawRow[] = ((data as unknown as RawRow[]) || []);
  const ids = rawRows.map((r) => r.id);
  const lastMovedMap = new Map<string, string>();
  if (ids.length > 0) {
    const mv = await sb
      .from('equipment_movements')
      .select('equipment_id, moved_at')
      .in('equipment_id', ids)
      .order('moved_at', { ascending: false });
    for (const m of (mv.data as { equipment_id: string; moved_at: string }[]) || []) {
      if (!lastMovedMap.has(m.equipment_id)) lastMovedMap.set(m.equipment_id, m.moved_at);
    }
  }

  const rows: StaffRow[] = rawRows.map((r) => ({
    id: r.id,
    name: r.name,
    brand: r.brand,
    model_number: r.model_number,
    category: r.category,
    quantity: r.quantity,
    unit: r.unit,
    status: r.status,
    siteName: r.sites?.name ?? null,
    lastMovedAt: lastMovedMap.get(r.id) ?? null,
  }));

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold" style={{ color: 'var(--nm-text-primary)' }}>設備</h1>

      {error && (
        <div className="nm-inset rounded-xl p-3 text-[13px]" style={{ color: 'var(--nm-danger)' }}>
          讀取失敗:{error.message}
        </div>
      )}

      <StaffEquipmentBoard rows={rows} />
    </div>
  );
}
