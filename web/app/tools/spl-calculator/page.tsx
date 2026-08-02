import { getSupabaseAdmin } from '@/lib/supabase';
import type { CatalogItem } from '@/lib/types';
import SplCalculatorForm from './SplCalculatorForm';

export const dynamic = 'force-dynamic';

export default async function SplCalculatorPage() {
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
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: 'var(--nm-text-primary)' }}>
          SPL 預算計算器
        </h1>
        <p className="text-[13px] mt-1" style={{ color: 'var(--nm-text-muted)' }}>
          用喇叭最大音壓反推可涵蓋的最遠距離,估算場地佈點用。
        </p>
      </div>
      <SplCalculatorForm speakers={speakers} amps={amps} />
    </div>
  );
}
