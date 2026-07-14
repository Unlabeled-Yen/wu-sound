import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/supabase';
import {
  EQUIPMENT_CATEGORY_LABEL,
  EQUIPMENT_STATUS_LABEL,
  formatEquipmentLocation,
  type EquipmentCategory,
  type EquipmentStatus,
} from '@/lib/types';
import { EQUIPMENT_STATUS_ORDER } from '@/lib/equipment-validation';

export const dynamic = 'force-dynamic';

const CATEGORIES = Object.keys(EQUIPMENT_CATEGORY_LABEL) as EquipmentCategory[];

interface Row {
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

function statusPillClass(status: EquipmentStatus): string {
  switch (status) {
    case 'in_storage':
      return 'nm-pill-neutral';
    case 'on_site':
      return 'nm-pill-warning';
    case 'in_repair':
      return 'nm-pill-danger';
    case 'retired':
      return 'nm-pill-muted';
  }
}

export default async function StaffEquipmentPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q || '').trim();
  const category = sp.category || '';

  const sb = getSupabaseAdmin();
  let query = sb
    .from('equipment')
    .select('id, name, brand, model_number, category, quantity, unit, status, current_site_id, sites:current_site_id(name)')
    .neq('status', 'retired')
    .limit(500);

  if (q) {
    const like = `%${q.replace(/[%_]/g, '')}%`;
    query = query.or(`name.ilike.${like},model_number.ilike.${like},brand.ilike.${like}`);
  }
  if (category && CATEGORIES.includes(category as EquipmentCategory)) {
    query = query.eq('category', category);
  }

  const { data, error } = await query;
  const rows: Row[] = ((data as any) || []).slice().sort((a: Row, b: Row) => {
    const sa = EQUIPMENT_STATUS_ORDER[a.status] ?? 99;
    const sb2 = EQUIPMENT_STATUS_ORDER[b.status] ?? 99;
    if (sa !== sb2) return sa - sb2;
    return String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hant');
  });

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold" style={{ color: 'var(--nm-text-primary)' }}>設備查詢</h1>

      <form method="get" className="space-y-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="名稱 / 型號 / 品牌"
          className="nm-input text-sm"
        />
        <div className="flex gap-2">
          <select name="category" defaultValue={category} className="nm-input text-sm flex-1">
            <option value="">全部分類</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{EQUIPMENT_CATEGORY_LABEL[c]}</option>)}
          </select>
          <button type="submit" className="nm-btn-solid text-sm">
            搜尋
          </button>
        </div>
        {(q || category) && (
          <Link href="/staff/equipment" className="text-xs underline nm-focus" style={{ color: 'var(--nm-text-muted)' }}>重設</Link>
        )}
      </form>

      {error && (
        <div className="nm-inset rounded-xl p-3 text-[13px]" style={{ color: 'var(--nm-danger)' }}>
          讀取失敗:{error.message}
        </div>
      )}

      <div className="text-xs" style={{ color: 'var(--nm-text-muted)' }}>共 {rows.length} 筆</div>

      <ul className="grid grid-cols-1 gap-2">
        {rows.length === 0 && (
          <li className="text-center py-8 text-[13px]" style={{ color: 'var(--nm-text-muted)' }}>沒有符合的設備</li>
        )}
        {rows.map((r) => (
          <li key={r.id} className="nm-raised rounded-2xl p-3 space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium text-[14px]" style={{ color: 'var(--nm-text-body)' }}>{r.name}</div>
                {r.model_number && (
                  <div className="text-xs mt-0.5" style={{ color: 'var(--nm-text-muted)' }}>
                    {r.brand ? r.brand + ' · ' : ''}{r.model_number}
                  </div>
                )}
              </div>
              <span className={`nm-pill shrink-0 ${statusPillClass(r.status)}`}>
                {EQUIPMENT_STATUS_LABEL[r.status]}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs" style={{ color: 'var(--nm-text-secondary)' }}>
              <span className="nm-pill nm-pill-muted">{EQUIPMENT_CATEGORY_LABEL[r.category]}</span>
              <span className="tabular">{r.quantity} {r.unit}</span>
            </div>
            <div className="text-sm" style={{ color: 'var(--nm-text-secondary)' }}>
              {formatEquipmentLocation(r.status, r.sites?.name)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
