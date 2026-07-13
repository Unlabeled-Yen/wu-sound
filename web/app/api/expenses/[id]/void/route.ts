import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });

  const sb = getSupabaseAdmin();
  const cur = await sb
    .from('expenses')
    .select('id, status')
    .eq('id', id)
    .eq('user_id', session.id)
    .maybeSingle();
  if (cur.error) {
    return NextResponse.json({ error: `查詢失敗: ${cur.error.message}` }, { status: 500 });
  }
  if (!cur.data) return NextResponse.json({ error: '找不到記錄' }, { status: 404 });
  if (cur.data.status !== 'draft') {
    return NextResponse.json({ error: '僅能作廢草稿' }, { status: 409 });
  }

  const upd = await sb
    .from('expenses')
    .update({ status: 'rejected', rejected_reason: '作廢' })
    .eq('id', id)
    .eq('user_id', session.id);
  if (upd.error) {
    return NextResponse.json({ error: `作廢失敗: ${upd.error.message}` }, { status: 500 });
  }

  await sb.from('audit_log').insert({
    actor_id: session.id,
    action: 'void',
    target_table: 'expenses',
    target_id: id,
    diff: { before: { status: 'draft' }, after: { status: 'rejected', rejected_reason: '作廢' } },
  });

  return NextResponse.json({ ok: true });
}
