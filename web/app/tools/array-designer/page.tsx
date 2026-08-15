import { getSupabaseAdmin } from '@/lib/supabase';
import type { CatalogItem } from '@/lib/types';
import ArrayDesignerForm from './ArrayDesignerForm';

export const dynamic = 'force-dynamic';

// catalog_items 的 coverage_h_deg(migration 012)有值就自動帶入覆蓋角,
// 沒建檔的品項維持手動輸入 + loud 提示(見 shared.tsx useSpeakerCov)。
//
// ?speaker=<catalog_item_id>&throw=<m>:SPL 計算器「帶入陣列設計器」的跨工具
// 交接值,兩支工具目前不共享狀態,用 query string 傳遞。
export default async function ArrayDesignerPage({ searchParams }: { searchParams: Promise<{ speaker?: string; throw?: string }> }) {
  const sp = (await searchParams) ?? {};
  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from('catalog_items')
    .select('*')
    .eq('active', true)
    .eq('item_type', '喇叭')
    .order('brand', { ascending: true })
    .order('name', { ascending: true });
  const speakers = (data ?? []) as CatalogItem[];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: 'var(--nm-text-primary)' }}>
          陣列設計器
        </h1>
        <p className="text-[13px] mt-1" style={{ color: 'var(--nm-text-muted)' }}>
          給定場地寬度、觀眾席距離、喇叭覆蓋角,推薦陣列喇叭數量與間距(Auto Mode)。
        </p>
      </div>
      <ArrayDesignerForm speakers={speakers} initialSpeakerId={sp.speaker} initialAudienceDistM={sp.throw} />
    </div>
  );
}
