import { getSupabaseAdmin } from '@/lib/supabase';
import { loadPlacebookData } from '@/lib/placebook-data';
import { PlacebookView } from './PlacebookView';
import { requirePageCapability } from '@/lib/require-capability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 專案管理首頁(design_handoff_wu_sound/15-placebook.md,後續改版:地點簿
// 就是唯一的專案管理頁,取代原本「全部專案」分頁——新增/改名/改類別/
// 改客戶/啟用停用全部整合進地點簿本身,見 PlacebookBoard.tsx)。
export default async function BossSitesPage() {
  await requirePageCapability('sites');

  const sb = getSupabaseAdmin();
  const data = await loadPlacebookData(sb);
  const summary = data.error
    ? ''
    : `${data.places.length} 個地方　·　${data.activeProjectCount} 個案子　·　場地知識 ${data.totalKnowledgeCount} 條`;

  return (
    <div>
      <div className="mb-5">
        <div className="text-[11px] uppercase mb-1" style={{ letterSpacing: '.16em', color: 'var(--nm-text-muted)' }}>專案管理</div>
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-[20px] font-semibold" style={{ color: 'var(--nm-text-primary)' }}>專案</h1>
          {summary && <span className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>{summary}</span>}
        </div>
      </div>

      <PlacebookView data={data} />
    </div>
  );
}
