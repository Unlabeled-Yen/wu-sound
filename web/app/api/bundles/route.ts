import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });
  if (session.role !== 'boss') return NextResponse.json({ error: '權限不足' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const includeInactive = searchParams.get('include_inactive') === '1';

  const sb = getSupabaseAdmin();
  let query = sb.from('bundle_templates').select('*');
  if (!includeInactive) query = query.eq('active', true);
  query = query.order('updated_at', { ascending: false });

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: `查詢失敗: ${error.message}` }, { status: 500 });
  return NextResponse.json({ bundles: data ?? [] });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });
  if (session.role !== 'boss') return NextResponse.json({ error: '權限不足' }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: '無效的請求' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: '請填套組名稱' }, { status: 400 });

  const sb = getSupabaseAdmin();
  const ins = await sb
    .from('bundle_templates')
    .insert({
      name,
      applicable_to: typeof body.applicable_to === 'string' && body.applicable_to.trim() ? body.applicable_to.trim() : null,
      note: typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null,
    })
    .select('*')
    .single();

  if (ins.error || !ins.data) {
    return NextResponse.json({ error: `新增失敗: ${ins.error?.message ?? 'unknown'}` }, { status: 500 });
  }

  await sb.from('audit_log').insert({
    actor_id: session.id,
    action: 'bundle.create',
    target_table: 'bundle_templates',
    target_id: ins.data.id,
    diff: { after: ins.data },
  });

  return NextResponse.json({ bundle: ins.data });
}
