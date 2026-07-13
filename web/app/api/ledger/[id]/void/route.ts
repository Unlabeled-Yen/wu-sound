import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });
  if (session.role !== 'boss') return NextResponse.json({ error: '權限不足' }, { status: 403 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });

  let reason = '作廢';
  try {
    const body = (await req.json()) as { reason?: string };
    if (body?.reason && typeof body.reason === 'string' && body.reason.trim()) {
      reason = body.reason.trim();
    }
  } catch {
    // 允許無 body
  }

  const sb = getSupabaseAdmin();
  const cur = await sb.from('ledger_entries').select('*').eq('id', id).maybeSingle();
  if (cur.error) return NextResponse.json({ error: `查詢失敗: ${cur.error.message}` }, { status: 500 });
  if (!cur.data) return NextResponse.json({ error: '找不到記錄' }, { status: 404 });
  if (cur.data.status === 'voided') return NextResponse.json({ error: '此筆已作廢' }, { status: 400 });

  const upd = await sb
    .from('ledger_entries')
    .update({ status: 'voided', voided_reason: reason })
    .eq('id', id)
    .select('*')
    .single();
  if (upd.error) return NextResponse.json({ error: `作廢失敗: ${upd.error.message}` }, { status: 500 });

  await sb.from('audit_log').insert({
    actor_id: session.id,
    action: 'ledger.void',
    target_table: 'ledger_entries',
    target_id: id,
    diff: { before: cur.data, after: upd.data, reason },
  });

  return NextResponse.json({ ok: true });
}
