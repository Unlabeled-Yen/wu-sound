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
  let q = supabase.from('sites').select('id, name, active').order('name', { ascending: true });
  if (activeOnly) q = q.eq('active', true);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: `讀取案場失敗: ${error.message}` }, { status: 500 });
  return NextResponse.json({ ok: true, sites: data || [] });
}
