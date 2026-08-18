import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSupabaseAdmin, RECEIPTS_BUCKET } from '@/lib/supabase';
import type { Task } from '@/lib/types';
import TaskBoard from './TaskBoard';
import QuickCaptureButton from './QuickCaptureButton';
import { requirePageCapability } from '@/lib/require-capability';

export const dynamic = 'force-dynamic';

const ARCHIVE_AFTER_DAYS = 14;

interface SiteDetail {
  id: string;
  name: string;
  active: boolean;
  customer_name: string | null;
}

interface WorklogRow {
  id: string;
  users: { name: string } | null;
  note: string;
  logged_on: string;
  created_at: string;
  photos: { kind: string; path: string }[];
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageCapability('sites');

  const { id } = await params;
  const sb = getSupabaseAdmin();

  const siteRes = await sb
    .from('sites')
    .select('id, name, active, customer_name')
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
  const site = siteRes.data as SiteDetail;

  const cutoff = new Date(Date.now() - ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [tasksRes, archivedRes, knowledgeRes, knowledgeCountRes, pinnedCountRes, worklogsRes] = await Promise.all([
    sb
      .from('tasks')
      .select('id, site_id, status, title, tags, created_by, blocked_on, blocked_since, due_date, photos, upload_pending, created_at, completed_at, users:created_by(name)')
      .eq('site_id', id)
      .or(`status.neq.done,completed_at.gte.${cutoff}`)
      .order('created_at', { ascending: true }),
    sb.from('tasks').select('id', { count: 'exact', head: true }).eq('site_id', id).eq('status', 'done').lt('completed_at', cutoff),
    sb.from('site_knowledge').select('id, body, hall').eq('site_id', id).eq('pinned', true).order('created_at', { ascending: true }).limit(3),
    sb.from('site_knowledge').select('id', { count: 'exact', head: true }).eq('site_id', id),
    sb.from('site_knowledge').select('id', { count: 'exact', head: true }).eq('site_id', id).eq('pinned', true),
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

  const knowledgeTotalCount = knowledgeCountRes.count ?? 0;
  const pinnedTotalCount = pinnedCountRes.count ?? 0;

  return (
    <div className="flex flex-col gap-0 h-full min-h-0">
      <div style={{ padding: '18px 28px', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
        <div className="flex items-center gap-2 mb-2" style={{ font: '400 12px/1 "Noto Sans TC",sans-serif', color: 'var(--nm-text-muted)' }}>
          <Link href="/boss/sites" className="underline nm-focus">專案管理</Link>
          <span>›</span>
          <span style={{ color: 'var(--nm-text-secondary)' }}>{site.name}</span>
        </div>
        <div className="flex items-end justify-between">
          <div className="flex items-center gap-3.5">
            <div style={{ font: '600 22px/1 "Noto Sans TC",sans-serif', color: 'var(--nm-text-primary)', letterSpacing: '-.01em' }}>
              {site.name}
            </div>
            <span className="nm-pill" style={{ color: 'var(--nm-success-glass-text)', background: 'rgba(126,207,157,0.14)', borderColor: 'rgba(126,207,157,0.35)' }}>
              {site.active ? '進行中' : '已停用'}
            </span>
            {site.customer_name && (
              <span style={{ font: '400 12px/1 "Noto Sans TC",sans-serif', color: 'var(--nm-text-muted)' }}>{site.customer_name}</span>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <div className="nm-btn" style={{ minHeight: 40, display: 'flex', alignItems: 'center', padding: '0 14px', fontSize: '12.5px' }}>篩選</div>
            <QuickCaptureButton siteId={site.id} />
          </div>
        </div>
      </div>

      {/* 場地知識帶:屬於地點,不屬於這個案子 */}
      <div className="flex items-center gap-4" style={{ padding: '12px 28px', borderBottom: '1px solid rgba(255,255,255,.05)', background: 'rgba(8,8,10,.3)' }}>
        <div className="flex items-center gap-2 shrink-0" style={{ font: '400 11px/1 "Noto Sans TC",sans-serif', letterSpacing: '.14em', color: 'var(--nm-text-muted)', textTransform: 'uppercase' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z"></path><circle cx="12" cy="10" r="2.5"></circle></svg>
          <span>場地知識　{site.name}</span>
        </div>
        {knowledgeRes.data && knowledgeRes.data.length > 0 ? (
          <div className="flex-1 min-w-0 flex" style={{ borderLeft: '1px solid rgba(255,255,255,.1)', paddingLeft: 16 }}>
            {knowledgeRes.data.map((k, i) => (
              <div
                key={k.id}
                className="flex-1"
                style={{
                  paddingLeft: i === 0 ? 0 : 16,
                  paddingRight: i === knowledgeRes.data.length - 1 ? 0 : 16,
                  borderRight: i === knowledgeRes.data.length - 1 ? 'none' : '1px solid rgba(255,255,255,.08)',
                  font: '400 12.5px/1.5 "Noto Sans TC",sans-serif',
                  color: 'var(--nm-text-secondary)',
                }}
              >
                {k.body}
                {k.hall && <span style={{ marginLeft: 6, color: 'var(--nm-text-muted)', fontSize: 11 }}>· {k.hall}</span>}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex-1" style={{ font: '400 12.5px/1.5 "Noto Sans TC",sans-serif', color: 'var(--nm-text-faint)' }}>還沒有進場必讀</div>
        )}
        <div className="shrink-0" style={{ font: '400 12px/1 "Noto Sans TC",sans-serif', color: 'var(--nm-text-muted)' }}>
          進場必讀 {pinnedTotalCount}　·　全部 {knowledgeTotalCount} 條
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 min-w-0" style={{ padding: '18px 20px 22px 28px' }}>
          <TaskBoard initialTasks={(tasksRes.data || []) as unknown as (Task & { users: { name: string } | null })[]} archivedDoneCount={archivedRes.count ?? 0} />
        </div>

        {/* 案子動態軌 */}
        <aside
          className="flex flex-col shrink-0"
          style={{ width: 260, borderLeft: '1px solid rgba(255,255,255,.07)', background: 'rgba(8,8,10,.3)', padding: '18px 20px' }}
        >
          <div className="flex items-baseline justify-between mb-3">
            <span style={{ font: '500 12.5px/1 "Noto Sans TC",sans-serif', color: 'var(--nm-text-body)' }}>案子動態</span>
            <Link href="/boss/worklogs?view=site" className="underline nm-focus" style={{ font: '400 11px/1 "Noto Sans TC",sans-serif', color: 'var(--nm-text-muted)' }}>
              全部日誌
            </Link>
          </div>

          {/* 老闆端寫日誌尚未接上(目前只有 staff/worklog 有寫入流程),先放視覺、不可互動 */}
          <div className="rounded-xl mb-3.5" style={{ background: 'rgba(30,30,36,.55)', border: '1px solid rgba(255,255,255,.12)', padding: '11px 12px' }}>
            <div style={{ font: '400 12.5px/1.5 "Noto Sans TC",sans-serif', color: 'var(--nm-text-muted)', marginBottom: 10 }}>今天發生了什麼？</div>
            <div className="flex gap-2">
              <span
                className="flex-1 rounded-lg flex items-center justify-center opacity-40"
                style={{ minHeight: 34, background: '#f0f0f2', color: '#17171a', font: '500 12px/1 "Noto Sans TC",sans-serif', cursor: 'not-allowed' }}
                aria-disabled="true"
                title="尚未接上,先到「全部日誌」補寫"
              >
                寫日誌
              </span>
            </div>
          </div>

          {worklogsWithUrls.length === 0 ? (
            <div style={{ font: '400 12.5px/1.5 "Noto Sans TC",sans-serif', color: 'var(--nm-text-faint)' }}>今天還沒有人寫日誌</div>
          ) : (
            <div className="flex flex-col">
              {worklogsWithUrls.map((w) => (
                <div key={w.id} style={{ padding: '12px 0', borderTop: '1px solid rgba(255,255,255,.07)' }}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="inline-flex items-center justify-center rounded-full" style={{ width: 20, height: 20, background: '#3a3a42', font: '500 9.5px/20px "Noto Sans TC",sans-serif', color: '#e4e4e7', textAlign: 'center' }}>
                      {(w.users?.name || '?').slice(0, 1)}
                    </span>
                    <span className="tabular-nums" style={{ font: '400 10.5px/1 var(--font-geist-mono),monospace', color: 'var(--nm-text-muted)' }}>
                      {new Date(w.created_at).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div style={{ font: '400 12.5px/1.6 "Noto Sans TC",sans-serif', color: 'var(--nm-text-secondary)' }}>{w.note}</div>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 'auto', paddingTop: 14 }}>
            <Link
              href="/boss/worklogs?view=site"
              className="nm-btn flex items-center justify-center"
              style={{ minHeight: 38, fontSize: 12 }}
            >
              全部日誌
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
