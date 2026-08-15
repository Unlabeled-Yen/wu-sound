import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

// 場地知識/專案備忘讀寫——任何已登入使用者(員工或老闆)都能用,不像
// boss/sites/[id]/actions.ts 的 addSiteNote 那樣只給老闆。理由:「誰記誰做」,
// 記錄的人本來就該是現場的員工,不是等老闆事後代打。釘選/升級檢查表/刪除
// 這些判斷性動作仍只留老闆端(那三個 action 沒有對應的公開 API)。
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });

  const url = new URL(req.url);
  const siteId = url.searchParams.get('site_id');
  if (!siteId) return NextResponse.json({ error: '缺少 site_id' }, { status: 400 });

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('site_notes')
    .select('id, site_id, zone, content, is_pinned, is_checklist, created_by, created_at, updated_at')
    .eq('site_id', siteId)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: `讀取備忘失敗: ${error.message}` }, { status: 500 });
  return NextResponse.json({ ok: true, notes: data ?? [] });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const siteId = String(body?.site_id || '').trim();
  const zone = String(body?.zone || '').trim();
  const content = String(body?.content || '').trim();

  if (!siteId) return NextResponse.json({ error: '請選擇專案' }, { status: 400 });
  if (!content) return NextResponse.json({ error: '請填寫備忘內容' }, { status: 400 });
  if (content.length > 500) return NextResponse.json({ error: '內容超過 500 字' }, { status: 400 });

  const sb = getSupabaseAdmin();
  const { error } = await sb.from('site_notes').insert({
    site_id: siteId,
    zone,
    content,
    created_by: session.id,
  });
  if (error) return NextResponse.json({ error: `寫入失敗: ${error.message}` }, { status: 500 });
  return NextResponse.json({ ok: true });
}
