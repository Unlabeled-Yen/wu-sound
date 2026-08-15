import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('venues').select('id, name').order('name', { ascending: true });
  if (error) return NextResponse.json({ error: `讀取場館失敗: ${error.message}` }, { status: 500 });
  return NextResponse.json({ ok: true, venues: data || [] });
}
