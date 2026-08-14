import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });
  const url = new URL(req.url);
  const activeOnly = url.searchParams.get('active') === '1';
  const supabase = getSupabaseAdmin();
  // category_id/customer_name 也回傳——老闆在案場管理頁維護的分類/客戶資訊,
  // 之前只有這支 API 沒帶出來,員工端(worklog/clockin 下拉選單)因此永遠看不到。
  let q = supabase.from('sites').select('id, name, active, category_id, customer_name').order('name', { ascending: true });
  if (activeOnly) q = q.eq('active', true);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: `讀取專案失敗: ${error.message}` }, { status: 500 });
  return NextResponse.json({ ok: true, sites: data || [] });
}
