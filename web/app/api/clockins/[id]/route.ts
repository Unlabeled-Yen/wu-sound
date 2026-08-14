import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });
  if (session.role !== 'boss') return NextResponse.json({ error: '權限不足' }, { status: 403 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: '無效的請求' }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const cur = await sb.from('clockins').select('*').eq('id', id).maybeSingle();
  if (cur.error) return NextResponse.json({ error: `查詢失敗: ${cur.error.message}` }, { status: 500 });
  if (!cur.data) return NextResponse.json({ error: '找不到打卡紀錄' }, { status: 404 });
  const before = cur.data;

  const patch: Record<string, unknown> = {};
  if ('ts' in body) {
    const d = new Date(body.ts as string);
    if (isNaN(d.getTime())) return NextResponse.json({ error: '時間格式錯誤' }, { status: 400 });
    if (d.getTime() > Date.now() + 60_000) return NextResponse.json({ error: '時間不能在未來' }, { status: 400 });
    patch.ts = d.toISOString();
  }
  if ('type' in body) {
    if (body.type !== 'in' && body.type !== 'out') return NextResponse.json({ error: '打卡類型錯誤' }, { status: 400 });
    patch.type = body.type;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: '沒有可更新的欄位' }, { status: 400 });
  }
  // 老闆手動改動一律標記為補登,保留可追溯性
  patch.is_backfill = true;
  patch.backfill_reason = `管理者編輯(原:${before.type} ${before.ts})`;

  const upd = await sb.from('clockins').update(patch).eq('id', id).select('*').single();
  if (upd.error || !upd.data) {
    return NextResponse.json({ error: `更新失敗: ${upd.error?.message ?? 'unknown'}` }, { status: 500 });
  }

  await sb.from('audit_log').insert({
    actor_id: session.id,
    action: 'clockin.update',
    target_table: 'clockins',
    target_id: id,
    diff: { before, after: upd.data },
  });

  return NextResponse.json({ ok: true, clockin: upd.data });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });
  if (session.role !== 'boss') return NextResponse.json({ error: '權限不足' }, { status: 403 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });

  const sb = getSupabaseAdmin();
  const cur = await sb.from('clockins').select('*').eq('id', id).maybeSingle();
  if (cur.error) return NextResponse.json({ error: `查詢失敗: ${cur.error.message}` }, { status: 500 });
  if (!cur.data) return NextResponse.json({ error: '找不到打卡紀錄' }, { status: 404 });
  const before = cur.data;

  const del = await sb.from('clockins').delete().eq('id', id);
  if (del.error) return NextResponse.json({ error: `刪除失敗: ${del.error.message}` }, { status: 500 });

  await sb.from('audit_log').insert({
    actor_id: session.id,
    action: 'clockin.delete',
    target_table: 'clockins',
    target_id: id,
    diff: { before, after: null },
  });

  return NextResponse.json({ ok: true });
}
