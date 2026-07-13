import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });

  let body: { type?: unknown; ts?: unknown; backfill_reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求' }, { status: 400 });
  }

  const type = body.type;
  if (type !== 'in' && type !== 'out') {
    return NextResponse.json({ error: '打卡類型錯誤' }, { status: 400 });
  }

  const tsRaw = typeof body.ts === 'string' ? body.ts.trim() : '';
  const reason = typeof body.backfill_reason === 'string' ? body.backfill_reason.trim() : '';

  const isBackfill = !!tsRaw || !!reason;
  if (isBackfill && !reason) {
    return NextResponse.json({ error: '補打卡需填寫原因' }, { status: 400 });
  }

  let tsIso: string;
  if (tsRaw) {
    const d = new Date(tsRaw);
    if (isNaN(d.getTime())) {
      return NextResponse.json({ error: '補打卡時間格式錯誤' }, { status: 400 });
    }
    if (d.getTime() > Date.now() + 60_000) {
      return NextResponse.json({ error: '補打卡時間不能在未來' }, { status: 400 });
    }
    tsIso = d.toISOString();
  } else {
    tsIso = new Date().toISOString();
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('clockins')
    .insert({
      user_id: session.id,
      ts: tsIso,
      type,
      is_backfill: isBackfill,
      backfill_reason: isBackfill ? reason : null,
    })
    .select('id, ts, type, is_backfill')
    .single();
  if (error) {
    return NextResponse.json({ error: `打卡失敗: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true, clockin: data });
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });
  const url = new URL(req.url);
  const all = url.searchParams.get('all') === '1';
  const monthParam = url.searchParams.get('month'); // YYYY-MM

  const now = new Date();
  let ym: string;
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    ym = monthParam;
  } else {
    ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
  const [yStr, mStr] = ym.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));

  const supabase = getSupabaseAdmin();
  let q = supabase
    .from('clockins')
    .select('id, user_id, ts, type, is_backfill, backfill_reason, created_at, users(name)')
    .gte('ts', start.toISOString())
    .lt('ts', end.toISOString())
    .order('ts', { ascending: true });

  if (all) {
    if (session.role !== 'boss') {
      return NextResponse.json({ error: '無權限' }, { status: 403 });
    }
  } else {
    q = q.eq('user_id', session.id);
  }

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: `讀取打卡失敗: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true, month: ym, clockins: data || [] });
}
