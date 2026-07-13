import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/supabase';
import {
  EQUIPMENT_CATEGORY_LABEL,
  EQUIPMENT_STATUS_LABEL,
  type EquipmentCategory,
  type EquipmentStatus,
} from '@/lib/types';
import { EQUIPMENT_STATUS_ORDER } from '@/lib/equipment-validation';

export const dynamic = 'force-dynamic';

const CATEGORIES = Object.keys(EQUIPMENT_CATEGORY_LABEL) as EquipmentCategory[];
const STATUSES = Object.keys(EQUIPMENT_STATUS_LABEL) as EquipmentStatus[];

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

export default async function BossEquipmentPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q || '').trim();
  const category = sp.category || '';
  const status = sp.status || '';

  const sb = getSupabaseAdmin();
  let query = sb
    .from('equipment')
    .select('id, name, brand, model_number, category, quantity, unit, status, current_site_id, sites:current_site_id(name)')
    .limit(500);

  if (q) {
    const like = `%${q.replace(/[%_]/g, '')}%`;
    query = query.or(`name.ilike.${like},model_number.ilike.${like},brand.ilike.${like}`);
  }
  if (category && CATEGORIES.includes(category as EquipmentCategory)) {
    query = query.eq('category', category);
  }
  if (status && STATUSES.includes(status as EquipmentStatus)) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  const rows: Row[] = ((data as any) || []).slice().sort((a: Row, b: Row) => {
    const sa = EQUIPMENT_STATUS_ORDER[a.status] ?? 99;
    const sb2 = EQUIPMENT_STATUS_ORDER[b.status] ?? 99;
    if (sa !== sb2) return sa - sb2;
    return String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hant');
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">大型設備 ({rows.length})</h1>
        <Link
          href="/boss/equipment/new"
          className="px-3 py-1.5 rounded bg-neutral-900 text-white text-sm dark:bg-white dark:text-neutral-900"
        >
          新增設備
        </Link>
      </div>

      <form method="get" className="flex flex-wrap gap-2 items-center">
        <input
          name="q"
          defaultValue={q}
          placeholder="名稱 / 型號 / 品牌"
          className="px-2 py-1.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm min-w-[220px]"
        />
        <select
          name="category"
          defaultValue={category}
          className="px-2 py-1.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm"
        >
          <option value="">全部分類</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{EQUIPMENT_CATEGORY_LABEL[c]}</option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={status}
          className="px-2 py-1.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm"
        >
          <option value="">全部狀態</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{EQUIPMENT_STATUS_LABEL[s]}</option>
          ))}
        </select>
        <button type="submit" className="px-3 py-1.5 rounded border border-neutral-300 dark:border-neutral-700 text-sm">
          篩選
        </button>
        {(q || category || status) && (
          <Link href="/boss/equipment" className="text-sm underline text-neutral-500">
            重設
          </Link>
        )}
      </form>

      {error && (
        <div className="p-3 rounded border border-red-300 bg-red-50 text-red-800 text-sm">
          讀取失敗:{error.message}
        </div>
      )}

      <div className="overflow-x-auto rounded border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-sm">
          <thead className="bg-neutral-100 dark:bg-neutral-900 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">名稱</th>
              <th className="px-3 py-2 font-medium">品牌</th>
              <th className="px-3 py-2 font-medium">型號</th>
              <th className="px-3 py-2 font-medium">類別</th>
              <th className="px-3 py-2 font-medium">數量</th>
              <th className="px-3 py-2 font-medium">狀態</th>
              <th className="px-3 py-2 font-medium">目前案場</th>
              <th className="px-3 py-2 font-medium">動作</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-neutral-500">
                  沒有符合條件的設備
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-neutral-200 dark:border-neutral-800">
                <td className="px-3 py-2">
                  <Link href={`/boss/equipment/${r.id}`} className="hover:underline font-medium">
                    {r.name}
                  </Link>
                </td>
                <td className="px-3 py-2 text-neutral-600 dark:text-neutral-400">{r.brand || '—'}</td>
                <td className="px-3 py-2 text-neutral-600 dark:text-neutral-400">{r.model_number || '—'}</td>
                <td className="px-3 py-2">{EQUIPMENT_CATEGORY_LABEL[r.category]}</td>
                <td className="px-3 py-2">{r.quantity} {r.unit}</td>
                <td className="px-3 py-2">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs ${statusPillClass(r.status)}`}>
                    {EQUIPMENT_STATUS_LABEL[r.status]}
                  </span>
                </td>
                <td className="px-3 py-2 text-neutral-600 dark:text-neutral-400">
                  {r.status === 'on_site' ? (r.sites?.name || '(未知)') : '—'}
                </td>
                <td className="px-3 py-2">
                  <Link href={`/boss/equipment/${r.id}`} className="text-sm underline">
                    詳情
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
