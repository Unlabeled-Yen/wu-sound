import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';
import { validatePin } from '@/lib/site-knowledge-validation';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });

  const url = new URL(req.url);
  const siteId = url.searchParams.get('site_id');
  if (!siteId) return NextResponse.json({ error: '缺少 site_id' }, { status: 400 });

  const supabase = getSupabaseAdmin();

  const [pinnedRes, allRes] = await Promise.all([
    supabase
      .from('site_knowledge')
      .select('id, body, hall, pinned, promoted_to_checklist, created_at')
      .eq('site_id', siteId)
      .eq('pinned', true)
      .order('created_at', { ascending: true }),
    supabase
      .from('site_knowledge')
      .select('id', { count: 'exact', head: true })
      .eq('site_id', siteId),
  ]);

  if (pinnedRes.error) return NextResponse.json({ error: `讀取場地知識失敗: ${pinnedRes.error.message}` }, { status: 500 });
  if (allRes.error) return NextResponse.json({ error: `讀取場地知識失敗: ${allRes.error.message}` }, { status: 500 });

  return NextResponse.json({
    ok: true,
    pinned: pinnedRes.data || [],
    total_count: allRes.count ?? 0,
  });
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
  const content = String(body.body || '').trim();
  const hall = body.hall ? String(body.hall).trim() : null;
  const pinned = body.pinned === true;

  if (!siteId) return NextResponse.json({ error: '缺少 site_id' }, { status: 400 });
  if (!content) return NextResponse.json({ error: '請填內容' }, { status: 400 });

  const supabase = getSupabaseAdmin();

  if (pinned) {
    const pinnedCount = await supabase
      .from('site_knowledge')
      .select('id', { count: 'exact', head: true })
      .eq('site_id', siteId)
      .eq('pinned', true);
    if (pinnedCount.error) return NextResponse.json({ error: `查詢失敗: ${pinnedCount.error.message}` }, { status: 500 });
    const err = validatePin(pinnedCount.count ?? 0);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('site_knowledge')
    .insert({
      site_id: siteId,
      body: content,
      hall,
      pinned,
      author_id: session.id,
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: `新增失敗: ${error.message}` }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}
