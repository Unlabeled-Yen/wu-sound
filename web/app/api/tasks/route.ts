import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';
import { TASK_TAGS } from '@/lib/types';

export const runtime = 'nodejs';

const ARCHIVE_AFTER_DAYS = 14;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });

  const url = new URL(req.url);
  const siteId = url.searchParams.get('site_id');
  if (!siteId) return NextResponse.json({ error: '缺少 site_id' }, { status: 400 });

  const cutoff = new Date(Date.now() - ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const supabase = getSupabaseAdmin();

  const [tasksRes, archivedRes] = await Promise.all([
    supabase
      .from('tasks')
      .select('id, site_id, title, description, due_date, status, created_by, source, tags, cover_photo_path, waiting_reason, stuck_since, checklist, created_at, updated_at, users:created_by(name)')
      .eq('site_id', siteId)
      .or(`status.neq.done,updated_at.gte.${cutoff}`)
      .order('created_at', { ascending: true }),
    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('site_id', siteId)
      .eq('status', 'done')
      .lt('updated_at', cutoff),
  ]);

  if (tasksRes.error) return NextResponse.json({ error: `讀取任務失敗: ${tasksRes.error.message}` }, { status: 500 });
  if (archivedRes.error) return NextResponse.json({ error: `讀取封存數失敗: ${archivedRes.error.message}` }, { status: 500 });

  return NextResponse.json({ ok: true, tasks: tasksRes.data || [], archived_done_count: archivedRes.count ?? 0 });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求內容' }, { status: 400 });
  }

  const siteId = String(body.site_id || '').trim();
  const title = String(body.title || '').trim();
  const tagsRaw = Array.isArray(body.tags) ? body.tags : [];
  const tags = tagsRaw.filter((t): t is string => typeof t === 'string' && (TASK_TAGS as readonly string[]).includes(t));

  if (!siteId) return NextResponse.json({ error: '缺少 site_id' }, { status: 400 });
  if (!title) return NextResponse.json({ error: '請填內容' }, { status: 400 });
  if (title.length > 200) return NextResponse.json({ error: '內容超過 200 字' }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      site_id: siteId,
      title,
      tags,
      created_by: session.id,
      source: 'web',
      status: 'todo',
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: `建立任務失敗: ${error.message}` }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}
