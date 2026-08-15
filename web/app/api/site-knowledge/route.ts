import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';
import { validatePin } from '@/lib/site-knowledge-validation';

export const runtime = 'nodejs';

async function resolveVenueId(supabase: ReturnType<typeof getSupabaseAdmin>, siteId: string): Promise<string | null> {
  const site = await supabase.from('sites').select('venue_id').eq('id', siteId).maybeSingle();
  return site.data?.venue_id ?? null;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });

  const url = new URL(req.url);
  const siteId = url.searchParams.get('site_id');
  if (!siteId) return NextResponse.json({ error: '缺少 site_id' }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const venueId = await resolveVenueId(supabase, siteId);
  if (!venueId) return NextResponse.json({ error: '找不到對應場館' }, { status: 404 });

  const [pinnedRes, allRes] = await Promise.all([
    supabase
      .from('site_knowledge')
      .select('id, content, area_label, pinned, promoted_to_checklist, created_at')
      .eq('venue_id', venueId)
      .eq('pinned', true)
      .order('created_at', { ascending: true }),
    supabase
      .from('site_knowledge')
      .select('source_site_id', { count: 'exact' })
      .eq('venue_id', venueId),
  ]);

  if (pinnedRes.error) return NextResponse.json({ error: `讀取場地知識失敗: ${pinnedRes.error.message}` }, { status: 500 });
  if (allRes.error) return NextResponse.json({ error: `讀取場地知識失敗: ${allRes.error.message}` }, { status: 500 });

  const caseCount = new Set((allRes.data || []).map((r) => r.source_site_id).filter(Boolean)).size;

  return NextResponse.json({
    ok: true,
    pinned: pinnedRes.data || [],
    total_count: allRes.count ?? 0,
    case_count: caseCount,
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
  const content = String(body.content || '').trim();
  const areaLabel = body.area_label ? String(body.area_label).trim() : null;
  const pinned = body.pinned === true;

  if (!siteId) return NextResponse.json({ error: '缺少 site_id' }, { status: 400 });
  if (!content) return NextResponse.json({ error: '請填內容' }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const venueId = await resolveVenueId(supabase, siteId);
  if (!venueId) return NextResponse.json({ error: '找不到對應場館' }, { status: 404 });

  if (pinned) {
    const pinnedCount = await supabase
      .from('site_knowledge')
      .select('id', { count: 'exact', head: true })
      .eq('venue_id', venueId)
      .eq('pinned', true);
    if (pinnedCount.error) return NextResponse.json({ error: `查詢失敗: ${pinnedCount.error.message}` }, { status: 500 });
    const err = validatePin(pinnedCount.count ?? 0);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('site_knowledge')
    .insert({
      venue_id: venueId,
      source_site_id: siteId,
      content,
      area_label: areaLabel,
      pinned,
      created_by: session.id,
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: `新增失敗: ${error.message}` }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}
