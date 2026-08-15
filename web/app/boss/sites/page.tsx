import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';
import { loadPlacebookData } from '@/lib/placebook-data';
import { PlacebookView } from './PlacebookView';
import { AllProjectsView } from './AllProjectsView';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Tab = 'placebook' | 'all';

// 專案管理首頁(design_handoff_wu_sound/15-placebook.md)。地點簿是預設分頁,
// 只讀、回答「這些地方現在怎麼樣」;全部專案是原本的主檔維護畫面,行內編輯
// 表單都留在那邊,地點簿不放任何輸入欄位(除搜尋)。
export default async function BossSitesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'boss') redirect('/staff');

  const sp = await searchParams;
  const tab: Tab = sp.tab === 'all' ? 'all' : 'placebook';
  const sb = getSupabaseAdmin();

  const [placebookData, sitesCountRes] = await Promise.all([
    tab === 'placebook' ? loadPlacebookData(sb) : Promise.resolve(null),
    sb.from('sites').select('id', { count: 'exact', head: true }),
  ]);
  const totalSitesCount = sitesCountRes.count ?? 0;

  const summary =
    tab === 'placebook' && placebookData
      ? `${placebookData.places.length} 個地方　·　${placebookData.activeProjectCount} 個案子　·　場地知識 ${placebookData.totalKnowledgeCount} 條`
      : `共 ${totalSitesCount} 個專案`;

  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[11px] uppercase mb-1" style={{ letterSpacing: '.16em', color: 'var(--nm-text-muted)' }}>專案管理</div>
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-[20px] font-semibold" style={{ color: 'var(--nm-text-primary)' }}>專案</h1>
            <span className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>{summary}</span>
          </div>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="nm-inset flex gap-1 p-1 text-[12.5px]" style={{ borderRadius: 999 }}>
            <Link
              href="/boss/sites"
              className="shrink-0"
              style={tab === 'placebook' ? { borderRadius: 999, padding: '6px 14px', background: '#f0f0f2', color: '#17171a', fontWeight: 500 } : { borderRadius: 999, padding: '6px 14px', color: 'var(--nm-text-secondary)' }}
            >
              地點簿
            </Link>
            <Link
              href="/boss/sites?tab=all"
              className="shrink-0"
              style={tab === 'all' ? { borderRadius: 999, padding: '6px 14px', background: '#f0f0f2', color: '#17171a', fontWeight: 500 } : { borderRadius: 999, padding: '6px 14px', color: 'var(--nm-text-secondary)' }}
            >
              全部專案 {totalSitesCount}
            </Link>
          </div>
          {tab === 'placebook' && (
            <Link href="/boss/sites?tab=all" className="nm-btn-solid text-[13px]">＋ 新增案子</Link>
          )}
        </div>
      </div>

      {tab === 'all' ? <AllProjectsView sb={sb} /> : <PlacebookView data={placebookData!} />}
    </div>
  );
}
