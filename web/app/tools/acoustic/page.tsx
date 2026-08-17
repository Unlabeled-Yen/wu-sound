import { getSupabaseAdmin } from '@/lib/supabase';
import type { CatalogItem } from '@/lib/types';
import { AcousticWorkbench } from './AcousticWorkbench';

export const dynamic = 'force-dynamic';

// 聲學計算併頁(16-acoustic-merged.md):取代 /tools/spl-calculator 與
// /tools/array-designer 兩個分開的頁面,兩支工具的 catalog 查詢併成一次。
//
// ?speaker=<catalog_item_id>&throw=<m>:沿用舊版陣列設計器的跨工具交接參數
// 格式,讓指到舊路由的既有連結(重導後)還能正確帶入。
export default async function AcousticPage({ searchParams }: { searchParams: Promise<{ speaker?: string; throw?: string }> }) {
  const sp = (await searchParams) ?? {};
  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from('catalog_items')
    .select('*')
    .eq('active', true)
    .in('item_type', ['喇叭', '擴大機'])
    .order('brand', { ascending: true })
    .order('name', { ascending: true });
  const all = (data ?? []) as CatalogItem[];
  const speakers = all.filter((i) => i.item_type === '喇叭');
  const amps = all.filter((i) => i.item_type === '擴大機');

  return (
    <AcousticWorkbench speakers={speakers} amps={amps} initialSpeakerId={sp.speaker} initialAudienceDistM={sp.throw} />
  );
}
