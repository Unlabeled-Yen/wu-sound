import { getSupabaseAdmin } from '@/lib/supabase';
import type { CatalogItem } from '@/lib/types';
import CategoryCarousel, { type CarouselPanel } from './CategoryCarousel';
import NewItemButton from './NewItemButton';
import ViewportLock from '@/app/_shared/ViewportLock';

export const dynamic = 'force-dynamic';

interface SP {
  q?: string;
  category?: string;
  include_inactive?: string;
}

export default async function CatalogPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = (await searchParams) ?? {};
  const q = sp.q?.trim() ?? '';
  const category = sp.category?.trim() ?? '';
  const includeInactive = sp.include_inactive === '1';

  const sb = getSupabaseAdmin();

  const catQ = await sb.from('catalog_items').select('category').eq('active', true);
  const categories = Array.from(
    new Set(
      ((catQ.data ?? []) as { category: string | null }[])
        .map((r) => r.category)
        .filter((c): c is string => !!c),
    ),
  ).sort();

  let query = sb.from('catalog_items').select('*');
  if (!includeInactive) query = query.eq('active', true);
  if (category) query = query.eq('category', category);
  if (q) query = query.or(`name.ilike.%${q}%,brand.ilike.%${q}%,item_type.ilike.%${q}%`);
  query = query.order('category', { ascending: true }).order('name', { ascending: true });
  const { data, error } = await query;
  const items = (data ?? []) as CatalogItem[];

  const missingCount = items.filter((i) => i.active && i.sell_price_twd === null).length;
  const isFiltered = Boolean(q || category || includeInactive);

  // 依 category 分組(未 filter 時才分)
  const missingItems = items.filter((i) => i.active && i.sell_price_twd === null);
  const groups = groupByCategory(items);

  const panels: CarouselPanel[] = isFiltered
    ? [
        {
          key: 'filtered',
          title: category || `搜尋結果:${q}`,
          hint: category ? `分類:${category}` : `找到 ${items.length} 項`,
          items,
        },
      ]
    : [
        ...(missingItems.length > 0
          ? [
              {
                key: 'missing',
                title: '⚠️ 待補售價',
                hint: `${missingItems.length} 項,補完才能報價出金額`,
                items: missingItems,
                tone: 'warning' as const,
              },
            ]
          : []),
        ...groups.map((g) => ({
          key: g.category,
          title: g.category,
          hint: `${g.items.length} 項`,
          items: g.items,
        })),
      ];

  return (
    <ViewportLock>
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 shrink-0">
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--nm-text-primary)' }}>
          價目表
        </h1>
        <span className="text-[13px]" style={{ color: 'var(--nm-text-muted)' }}>
          共 {items.length} 項
        </span>
        {missingCount > 0 && (
          <span className="nm-pill nm-pill-warning">
            {missingCount} 項待設定售價
          </span>
        )}
        <div className="ml-auto">
          <NewItemButton />
        </div>
      </div>

      {/* Search */}
      <form
        action="/boss/catalog"
        method="get"
        className="flex flex-wrap items-center gap-3 text-[13px] rounded-2xl nm-inset px-4 py-3 shrink-0"
      >
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="搜尋品名 / 品牌 / 類型"
          className="flex-1 min-w-[16rem] bg-transparent outline-none nm-focus px-2 py-1 rounded"
          style={{ color: 'var(--nm-text-primary)' }}
        />
        <select
          name="category"
          defaultValue={category}
          className="nm-btn text-[13px]"
          style={{ paddingTop: 8, paddingBottom: 8, minHeight: 40 }}
        >
          <option value="">分類:全部</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 whitespace-nowrap" style={{ color: 'var(--nm-text-muted)' }}>
          <input type="checkbox" name="include_inactive" value="1" defaultChecked={includeInactive} />
          顯示已下架
        </label>
        <button type="submit" className="nm-btn nm-focus text-[13px]" style={{ minHeight: 40 }}>
          查詢
        </button>
        {isFiltered && (
          <a
            href="/boss/catalog"
            className="text-[13px] underline underline-offset-2 nm-focus rounded px-2 py-1"
            style={{ color: 'var(--nm-text-muted)' }}
          >
            清除
          </a>
        )}
      </form>

      {error && (
        <div className="rounded-xl nm-inset p-4 text-[13px] shrink-0" style={{ color: 'var(--nm-danger)' }}>
          查詢失敗:{error.message}
        </div>
      )}

      {!error && items.length === 0 && (
        <div className="rounded-2xl nm-inset p-10 text-center shrink-0">
          <div className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>
            沒有符合的品項
          </div>
        </div>
      )}

      {/* 分類群組 → 橫向滑動 carousel(單一結果時不顯示分頁控制,只有內部滾動) */}
      {!error && items.length > 0 && <CategoryCarousel panels={panels} />}
    </ViewportLock>
  );
}

function groupByCategory(items: CatalogItem[]): { category: string; items: CatalogItem[] }[] {
  const map = new Map<string, CatalogItem[]>();
  for (const it of items) {
    const key = it.category ?? '未分類';
    const arr = map.get(key) ?? [];
    arr.push(it);
    map.set(key, arr);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b, 'zh-Hant'))
    .map(([category, items]) => ({ category, items }));
}
