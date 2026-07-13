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
      return 'bg-neutral-200 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200';
    case 'on_site':
      return 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200';
    case 'in_repair':
      return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200';
    case 'retired':
      return 'bg-neutral-100 text-neutral-500 line-through dark:bg-neutral-900 dark:text-neutral-500';
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
    <div className="p-4 space-y-3">
      <h1 className="text-lg font-semibold">設備查詢</h1>

      <form method="get" className="space-y-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="名稱 / 型號 / 品牌"
          className="w-full px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
        />
        <div className="flex gap-2">
          <select name="category" defaultValue={category}
            className="flex-1 px-2 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm">
            <option value="">全部分類</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{EQUIPMENT_CATEGORY_LABEL[c]}</option>)}
          </select>
          <button type="submit" className="px-3 py-2 rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm">
            搜尋
          </button>
        </div>
        {(q || category) && (
          <Link href="/staff/equipment" className="text-xs underline text-neutral-500">重設</Link>
        )}
      </form>

      {error && (
        <div className="p-3 rounded border border-red-300 bg-red-50 text-red-800 text-sm">
          讀取失敗:{error.message}
        </div>
      )}

      <div className="text-xs text-neutral-500">共 {rows.length} 筆</div>

      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {rows.length === 0 && (
          <li className="text-center text-neutral-500 py-8">沒有符合的設備</li>
        )}
        {rows.map((r) => (
          <li key={r.id} className="rounded border border-neutral-200 dark:border-neutral-800 p-3 bg-white dark:bg-neutral-900 space-y-1">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium">{r.name}</div>
                {r.model_number && <div className="text-xs text-neutral-500">{r.brand ? r.brand + ' · ' : ''}{r.model_number}</div>}
              </div>
              <span className={`shrink-0 inline-block px-2 py-0.5 rounded text-xs ${statusPillClass(r.status)}`}>
                {EQUIPMENT_STATUS_LABEL[r.status]}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-neutral-600 dark:text-neutral-400">
              <span className="inline-block px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800">
                {EQUIPMENT_CATEGORY_LABEL[r.category]}
              </span>
              <span>{r.quantity} {r.unit}</span>
            </div>
            <div className="text-sm">
              {formatEquipmentLocation(r.status, r.sites?.name)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
