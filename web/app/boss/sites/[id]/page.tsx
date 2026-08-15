import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin, RECEIPTS_BUCKET } from '@/lib/supabase';
import type { Task } from '@/lib/types';
import TaskBoard from './TaskBoard';
import QuickCaptureButton from './QuickCaptureButton';

export const dynamic = 'force-dynamic';

const ARCHIVE_AFTER_DAYS = 14;

interface SiteDetail {
  id: string;
  name: string;
  active: boolean;
  customer_name: string | null;
  venue_id: string;
  venues: { name: string } | null;
}

interface WorklogRow {
  id: string;
  users: { name: string } | null;
  note: string;
  logged_on: string;
  created_at: string;
  photos: { kind: string; path: string }[];
}

export default async function SiteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'boss') redirect('/staff');

  const { id } = await params;
  const sb = getSupabaseAdmin();

  const siteRes = await sb
    .from('sites')
    .select('id, name, active, customer_name, venue_id, venues:venue_id(name)')
    .eq('id', id)
    .maybeSingle();
  if (siteRes.error) {
    return (
      <div className="rounded-xl nm-inset p-3" style={{ color: 'var(--nm-danger)' }}>
        讀取失敗:{siteRes.error.message}
      </div>
    );
  }
  if (!siteRes.data) notFound();
  const site = siteRes.data as unknown as SiteDetail;

  const cutoff = new Date(Date.now() - ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [tasksRes, archivedRes, knowledgeRes, worklogsRes] = await Promise.all([
    sb
      .from('tasks')
      .select('id, site_id, title, description, due_date, status, created_by, source, tags, cover_photo_path, waiting_reason, stuck_since, checklist, created_at, updated_at, users:created_by(name)')
      .eq('site_id', id)
      .or(`status.neq.done,updated_at.gte.${cutoff}`)
      .order('created_at', { ascending: true }),
    sb.from('tasks').select('id', { count: 'exact', head: true }).eq('site_id', id).eq('status', 'done').lt('updated_at', cutoff),
    // 桌機這一帶只是預覽:進場必讀上限 5,但橫向排列只放最前面 3 條,其餘要點「全部 N 條」進 11c 全頁看。
    sb.from('site_knowledge').select('id, content, area_label').eq('venue_id', site.venue_id).eq('pinned', true).order('created_at', { ascending: true }).limit(3),
    sb
      .from('worklogs')
      .select('id, users(name), note, logged_on, created_at, photos')
      .eq('site_id', id)
      .order('created_at', { ascending: false })
      .limit(3),
  ]);

  if (tasksRes.error) {
    return (
      <div className="rounded-xl nm-inset p-3" style={{ color: 'var(--nm-danger)' }}>
        讀取任務失敗:{tasksRes.error.message}
      </div>
    );
  }

  const [knowledgeCountRes, pinnedCountRes] = await Promise.all([
    sb.from('site_knowledge').select('source_site_id', { count: 'exact' }).eq('venue_id', site.venue_id),
    sb.from('site_knowledge').select('id', { count: 'exact', head: true }).eq('venue_id', site.venue_id).eq('pinned', true),
  ]);
  const knowledgeTotalCount = knowledgeCountRes.count ?? 0;
  const pinnedTotalCount = pinnedCountRes.count ?? 0;

  const worklogRows = (worklogsRes.data || []) as unknown as WorklogRow[];
  const worklogsWithUrls = await Promise.all(
    worklogRows.map(async (r) => {
      const first = Array.isArray(r.photos) && r.photos.length > 0 ? r.photos[0] : null;
      let thumbUrl: string | null = null;
      if (first) {
        const { data: s } = await sb.storage.from(RECEIPTS_BUCKET).createSignedUrl(first.path, 3600);
        thumbUrl = s?.signedUrl || null;
      }
      return { ...r, thumbUrl };
    })
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs" style={{ color: 'var(--nm-text-muted)' }}>
          <Link href="/boss/sites" className="underline nm-focus">專案管理</Link>
          {' › '}{site.name}
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <h1 className="text-xl font-semibold" style={{ color: 'var(--nm-text-primary)' }}>{site.name}</h1>
            <span className="nm-pill" style={{ color: 'var(--nm-success-glass-text)', background: 'rgba(126,207,157,0.08)', borderColor: 'rgba(126,207,157,0.26)' }}>
              {site.active ? '進行中' : '已停用'}
            </span>
            <span className="text-[12px]" style={{ color: 'var(--nm-text-muted)' }}>
              {site.customer_name ? `客戶 · ${site.customer_name}` : ''}
            </span>
          </div>
          <div className="flex gap-2">
            <button type="button" disabled className="nm-btn text-[13px] opacity-40" title="出車前檢查表尚未接上,下一輪再做">出車前檢查表</button>
            <QuickCaptureButton siteId={site.id} />
          </div>
        </div>
      </div>

      <div className="rounded-2xl nm-raised-sm px-4 py-3 flex flex-wrap items-center gap-4">
        <div className="text-xs uppercase tracking-wide flex items-center gap-1" style={{ color: 'var(--nm-text-muted)' }}>
          場地知識 · {site.venues?.name ?? site.name}
        </div>
        {knowledgeRes.data && knowledgeRes.data.length > 0 ? (
          <div className="flex-1 flex flex-wrap divide-x" style={{ borderColor: 'var(--nm-border-hair)' }}>
            {knowledgeRes.data.map((k) => (
              <div key={k.id} className="px-3 first:pl-0 text-[13px]" style={{ color: 'var(--nm-text-body)' }}>
                <span style={{ color: 'var(--nm-warning)' }}>★</span> {k.content}
                {k.area_label && <span className="ml-1 text-xs" style={{ color: 'var(--nm-text-muted)' }}>· {k.area_label}</span>}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex-1 text-[13px]" style={{ color: 'var(--nm-text-faint)' }}>還沒有進場必讀</div>
        )}
        <div className="text-xs" style={{ color: 'var(--nm-text-muted)' }}>
          進場必讀 {pinnedTotalCount} · 全部 {knowledgeTotalCount} 條
          <span className="ml-1" style={{ color: 'var(--nm-text-faint)' }}>(全頁瀏覽下一輪接上)</span>
        </div>
      </div>

      <div className="flex-1 flex gap-4 items-start">
        <div className="flex-1 min-w-0">
          <TaskBoard initialTasks={(tasksRes.data || []) as unknown as (Task & { users: { name: string } | null })[]} archivedDoneCount={archivedRes.count ?? 0} />
        </div>

        <aside className="w-[260px] shrink-0 rounded-2xl nm-raised p-3 space-y-3" style={{ borderLeft: '1px solid var(--nm-border-hair)' }}>
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-semibold" style={{ color: 'var(--nm-text-primary)' }}>案子動態</h2>
            <Link href="/boss/worklogs?view=site" className="text-xs underline nm-focus" style={{ color: 'var(--nm-text-muted)' }}>全部日誌</Link>
          </div>
          {worklogsWithUrls.length === 0 ? (
            <div className="text-[13px]" style={{ color: 'var(--nm-text-faint)' }}>還沒有工作記錄</div>
          ) : (
            <ul className="space-y-3">
              {worklogsWithUrls.map((w) => (
                <li key={w.id} className="text-[12.5px]" style={{ borderTop: '1px solid var(--nm-border-hair)', paddingTop: 8 }}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="inline-flex items-center justify-center rounded-full nm-inset-sm w-5 h-5 text-[10px]" style={{ color: 'var(--nm-text-secondary)' }}>
                      {(w.users?.name || '?').slice(0, 1)}
                    </span>
                    <span style={{ color: 'var(--nm-text-secondary)' }}>{w.users?.name || '(未知)'}</span>
                    <span className="ml-auto tabular" style={{ color: 'var(--nm-text-faint)' }}>
                      {new Date(w.created_at).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div style={{ color: 'var(--nm-text-body)' }}>{w.note}</div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
