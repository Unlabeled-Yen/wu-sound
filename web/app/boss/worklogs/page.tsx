import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin, RECEIPTS_BUCKET } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REASON_LABEL: Record<string, string> = {
  delivery: '交貨',
  maintenance: '保養',
  interview: '訪談',
  other: '其他',
};

interface Photo {
  kind: string;
  path: string;
}

interface Row {
  id: string;
  user_id: string;
  site_id: string | null;
  logged_on: string;
  note: string;
  photos: Photo[];
  no_photo_reason: string | null;
  created_at: string;
  users: { name: string } | null;
  sites: { name: string } | null;
  photo_urls: { kind: string; url: string | null }[];
}

async function loadWorklogs(): Promise<{ rows: Row[]; error: string | null }> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('worklogs')
    .select('id, user_id, site_id, logged_on, note, photos, no_photo_reason, created_at, users(name), sites(name)')
    .order('logged_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) return { rows: [], error: error.message };

  const rows = await Promise.all(
    (data || []).map(async (r) => {
      const photos = Array.isArray(r.photos) ? (r.photos as Photo[]) : [];
      const urls = await Promise.all(
        photos.map(async (p) => {
          const { data: s } = await supabase.storage
            .from(RECEIPTS_BUCKET)
            .createSignedUrl(p.path, 60 * 60);
          return { kind: p.kind, url: s?.signedUrl || null };
        })
      );
      return { ...r, photos, photo_urls: urls } as unknown as Row;
    })
  );
  return { rows, error: null };
}

export default async function BossWorklogsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'boss') redirect('/');

  const sp = await searchParams;
  const view = sp.view === 'site' ? 'site' : 'timeline';

  const { rows, error } = await loadWorklogs();

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--nm-text-primary)' }}>工作記錄</h1>
        <nav className="flex gap-1 rounded-2xl nm-inset p-1 text-[13px]">
          <Link
            href="/boss/worklogs?view=timeline"
            className={view === 'timeline' ? 'nm-btn-solid' : 'nm-btn'}
            style={{ padding: '6px 14px', minHeight: 'auto' }}
          >
            時間軸
          </Link>
          <Link
            href="/boss/worklogs?view=site"
            className={view === 'site' ? 'nm-btn-solid' : 'nm-btn'}
            style={{ padding: '6px 14px', minHeight: 'auto' }}
          >
            依專案
          </Link>
        </nav>
      </header>

      {error && (
        <div
          className="mb-4 rounded-xl p-3 text-[13px]"
          style={{
            background: 'rgba(224, 122, 122, 0.08)',
            border: '1px solid rgba(224, 122, 122, 0.34)',
            color: 'var(--nm-danger-glass-text)',
          }}
        >
          讀取工作記錄失敗:{error}
        </div>
      )}

      {rows.length === 0 && !error && (
        <p className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>尚無工作記錄</p>
      )}

      {view === 'timeline' ? <TimelineView rows={rows} /> : <SiteView rows={rows} />}
    </div>
  );
}

function EntryCard({ row, showSite = true, showDate = false }: { row: Row; showSite?: boolean; showDate?: boolean }) {
  return (
    <li className="rounded-2xl nm-raised p-4">
      <div className="mb-1 flex flex-wrap items-baseline gap-2 text-[13px]">
        <span className="font-semibold" style={{ color: 'var(--nm-text-primary)' }}>{row.users?.name || '(未知)'}</span>
        {showSite && (
          <span style={{ color: 'var(--nm-text-secondary)' }}>· {row.sites?.name || '(未指定專案)'}</span>
        )}
        {showDate && <span style={{ color: 'var(--nm-text-muted)' }}>· {row.logged_on}</span>}
        <span className="ml-auto text-xs" style={{ color: 'var(--nm-text-faint)' }}>
          {new Date(row.created_at).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <p className="mb-2 text-[13px]" style={{ color: 'var(--nm-text-body)' }}>{row.note}</p>
      {row.photo_urls.length > 0 ? (
        <div className="flex flex-wrap gap-3">
          {row.photo_urls.map((p, i) => (
            <div key={i}>
              <div className="mb-1 text-xs" style={{ color: 'var(--nm-text-muted)' }}>
                {p.kind === 'before' ? '施工前' : '施工後'}
              </div>
              {p.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.url}
                  alt={p.kind}
                  className="h-28 w-28 rounded-lg object-cover"
                  style={{ border: '1px solid var(--nm-border-glass)' }}
                />
              ) : (
                <div className="h-28 w-28 rounded-lg nm-inset" />
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-xs" style={{ color: 'var(--nm-text-muted)' }}>
          無照片原因:
          {row.no_photo_reason ? REASON_LABEL[row.no_photo_reason] || row.no_photo_reason : '未填'}
        </div>
      )}
    </li>
  );
}

function TimelineView({ rows }: { rows: Row[] }) {
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = r.logged_on;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  const keys = Array.from(groups.keys()).sort((a, b) => b.localeCompare(a));
  return (
    <div className="space-y-6">
      {keys.map((date) => (
        <section key={date}>
          <h2 className="mb-2 text-lg font-semibold" style={{ color: 'var(--nm-text-primary)' }}>{date}</h2>
          <ul className="space-y-2">
            {groups.get(date)!.map((r) => (
              <EntryCard key={r.id} row={r} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function SiteView({ rows }: { rows: Row[] }) {
  const groups = new Map<string, { name: string; byDate: Map<string, Row[]> }>();
  for (const r of rows) {
    const key = r.sites?.name || '(未指定專案)';
    if (!groups.has(key)) groups.set(key, { name: key, byDate: new Map() });
    const g = groups.get(key)!;
    if (!g.byDate.has(r.logged_on)) g.byDate.set(r.logged_on, []);
    g.byDate.get(r.logged_on)!.push(r);
  }
  const siteKeys = Array.from(groups.keys()).sort();
  return (
    <div className="space-y-6">
      {siteKeys.map((sk) => {
        const g = groups.get(sk)!;
        const dates = Array.from(g.byDate.keys()).sort((a, b) => b.localeCompare(a));
        return (
          <section key={sk}>
            <h2 className="mb-2 text-lg font-semibold" style={{ color: 'var(--nm-text-primary)' }}>{sk}</h2>
            <div className="space-y-4 pl-2">
              {dates.map((d) => (
                <div key={d}>
                  <h3 className="mb-1 text-[13px] font-medium" style={{ color: 'var(--nm-text-secondary)' }}>{d}</h3>
                  <ul className="space-y-2">
                    {g.byDate.get(d)!.map((r) => (
                      <EntryCard key={r.id} row={r} showSite={false} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
