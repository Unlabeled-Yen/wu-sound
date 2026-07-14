import { getSupabaseAdmin } from '@/lib/supabase';
import type { CatalogItem } from '@/lib/types';
import CatalogRow from './CatalogRow';
import NewItemButton from './NewItemButton';

export const dynamic = 'force-dynamic';

interface SP {
  q?: string;
  category?: string;
}

export default async function CatalogPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = (await searchParams) ?? {};
  const q = sp.q?.trim() ?? '';
  const category = sp.category?.trim() ?? '';

  const sb = getSupabaseAdmin();

  // 分類選項(全部 active 品項的 distinct category)
  const catQ = await sb.from('catalog_items').select('category').eq('active', true);
  const categories = Array.from(
    new Set(((catQ.data ?? []) as { category: string | null }[]).map((r) => r.category).filter((c): c is string => !!c)),
  ).sort();

  let query = sb.from('catalog_items').select('*').eq('active', true);
  if (category) query = query.eq('category', category);
  if (q) query = query.or(`name.ilike.%${q}%,brand.ilike.%${q}%,item_type.ilike.%${q}%`);
  query = query.order('category', { ascending: true }).order('name', { ascending: true });
  const { data, error } = await query;
  const items = (data ?? []) as CatalogItem[];

  const missingCount = items.filter((i) => i.sell_price_twd === null).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">品項庫</h1>
        {missingCount > 0 && (
          <span className="text-sm px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
            {missingCount} 項待設定售價
          </span>
        )}
        <div className="ml-auto">
          <NewItemButton />
        </div>
      </div>

      <form action="/boss/catalog" method="get" className="flex flex-wrap items-center gap-2 text-sm">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="搜尋品名 / 品牌 / 類型"
          className="border border-neutral-300 dark:border-neutral-700 rounded px-3 py-1.5 bg-white dark:bg-neutral-900 min-w-[14rem]"
        />
        <select
          name="category"
          defaultValue={category}
          className="border border-neutral-300 dark:border-neutral-700 rounded px-2 py-1.5 bg-white dark:bg-neutral-900"
        >
          <option value="">分類:全部</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <button type="submit" className="px-3 py-1.5 border border-neutral-300 dark:border-neutral-700 rounded">
          查詢
        </button>
        {(q || category) && (
          <a href="/boss/catalog" className="px-3 py-1.5 text-neutral-500 underline">清除</a>
        )}
      </form>

      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-x-auto bg-white dark:bg-neutral-900">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-950 text-neutral-500">
            <tr>
              <th className="text-left px-3 py-2">品牌</th>
              <th className="text-left px-3 py-2">品名</th>
              <th className="text-left px-3 py-2">類型</th>
              <th className="text-left px-3 py-2">單位</th>
              <th className="text-right px-3 py-2">進價</th>
              <th className="text-right px-3 py-2">售價</th>
              <th className="text-left px-3 py-2">分類</th>
              <th className="text-left px-3 py-2 w-20">動作</th>
            </tr>
          </thead>
          <tbody>
            {error && (
              <tr><td colSpan={8} className="px-3 py-4 text-red-600">查詢失敗: {error.message}</td></tr>
            )}
            {!error && items.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-neutral-500">沒有符合的品項</td></tr>
            )}
            {items.map((item) => (
              <CatalogRow key={item.id} item={item} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
