import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

// 每日案場歸屬:下班打卡時記錄「今天去了哪個案場」,可多選、可跳過(不送=未分攤)。
// 老闆可事後改(帶 user_id 覆蓋別人的紀錄);員工只能改自己的。

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });

  let body: { worked_on?: unknown; site_ids?: unknown; user_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求' }, { status: 400 });
  }

  const workedOn = typeof body.worked_on === 'string' ? body.worked_on : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(workedOn)) {
    return NextResponse.json({ error: '日期格式錯誤' }, { status: 400 });
  }
  const siteIds = Array.isArray(body.site_ids) ? body.site_ids.filter((x): x is string => typeof x === 'string' && x.length > 0) : [];

  let targetUserId = session.id;
  if (typeof body.user_id === 'string' && body.user_id && body.user_id !== session.id) {
    if (session.role !== 'boss') return NextResponse.json({ error: '無權限修改他人紀錄' }, { status: 403 });
    targetUserId = body.user_id;
  }

  const sb = getSupabaseAdmin();

  const del = await sb.from('day_site_allocations').delete().eq('user_id', targetUserId).eq('worked_on', workedOn);
  if (del.error) return NextResponse.json({ error: `更新失敗: ${del.error.message}` }, { status: 500 });

  if (siteIds.length > 0) {
    const rows = siteIds.map((site_id) => ({
      user_id: targetUserId,
      worked_on: workedOn,
      site_id,
      created_by: session.id,
    }));
    const ins = await sb.from('day_site_allocations').insert(rows);
    if (ins.error) return NextResponse.json({ error: `寫入失敗: ${ins.error.message}` }, { status: 500 });
  }

  await sb.from('audit_log').insert({
    actor_id: session.id,
    action: 'day_site_allocation.set',
    target_table: 'day_site_allocations',
    target_id: `${targetUserId}:${workedOn}`,
    diff: { worked_on: workedOn, site_ids: siteIds, user_id: targetUserId },
  });

  return NextResponse.json({ ok: true });
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const month = searchParams.get('month');
  const date = searchParams.get('date');
  const all = searchParams.get('all') === '1';

  if (all && session.role !== 'boss') {
    return NextResponse.json({ error: '無權限' }, { status: 403 });
  }

  const sb = getSupabaseAdmin();
  let q = sb.from('day_site_allocations').select('id, user_id, worked_on, site_id, hours, sites(name), users(name)');

  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    q = q.eq('worked_on', date);
  } else if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split('-').map(Number);
    const from = `${month}-01`;
    const nextY = m === 12 ? y + 1 : y;
    const nextM = m === 12 ? 1 : m + 1;
    const to = `${nextY}-${String(nextM).padStart(2, '0')}-01`;
    q = q.gte('worked_on', from).lt('worked_on', to);
  } else {
    return NextResponse.json({ error: '缺少 month 或 date' }, { status: 400 });
  }

  if (!all) q = q.eq('user_id', session.id);

  const { data, error } = await q.order('worked_on', { ascending: true });
  if (error) return NextResponse.json({ error: `讀取失敗: ${error.message}` }, { status: 500 });
  return NextResponse.json({ ok: true, allocations: data ?? [] });
}
