import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { BundleLine, BundleTemplate } from '@/lib/types';

export const runtime = 'nodejs';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });
  if (session.role !== 'boss') return NextResponse.json({ error: '權限不足' }, { status: 403 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });

  const sb = getSupabaseAdmin();
  const b = await sb.from('bundle_templates').select('*').eq('id', id).maybeSingle();
  if (b.error) return NextResponse.json({ error: `查詢失敗: ${b.error.message}` }, { status: 500 });
  if (!b.data) return NextResponse.json({ error: '找不到套組' }, { status: 404 });

  const l = await sb
    .from('bundle_lines')
    .select('*')
    .eq('bundle_id', id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (l.error) return NextResponse.json({ error: `查詢失敗: ${l.error.message}` }, { status: 500 });

  return NextResponse.json({ bundle: b.data as BundleTemplate, lines: (l.data ?? []) as BundleLine[] });
}

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
  const cur = await sb.from('bundle_templates').select('*').eq('id', id).maybeSingle();
  if (cur.error) return NextResponse.json({ error: `查詢失敗: ${cur.error.message}` }, { status: 500 });
  if (!cur.data) return NextResponse.json({ error: '找不到套組' }, { status: 404 });
  const before = cur.data as BundleTemplate;

  const patch: Record<string, unknown> = {};
  if ('name' in body) {
    const nm = typeof body.name === 'string' ? body.name.trim() : '';
    if (!nm) return NextResponse.json({ error: '套組名稱不可為空' }, { status: 400 });
    patch.name = nm;
  }
  if ('applicable_to' in body) patch.applicable_to = typeof body.applicable_to === 'string' && body.applicable_to.trim() ? body.applicable_to.trim() : null;
  if ('note' in body) patch.note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null;
  if ('active' in body) patch.active = Boolean(body.active);

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: '沒有可更新的欄位' }, { status: 400 });
  }

  const upd = await sb.from('bundle_templates').update(patch).eq('id', id).select('*').single();
  if (upd.error || !upd.data) {
    return NextResponse.json({ error: `更新失敗: ${upd.error?.message ?? 'unknown'}` }, { status: 500 });
  }

  await sb.from('audit_log').insert({
    actor_id: session.id,
    action: 'bundle.update',
    target_table: 'bundle_templates',
    target_id: id,
    diff: { before, after: upd.data },
  });

  return NextResponse.json({ bundle: upd.data });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });
  if (session.role !== 'boss') return NextResponse.json({ error: '權限不足' }, { status: 403 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });

  const sb = getSupabaseAdmin();
  const cur = await sb.from('bundle_templates').select('*').eq('id', id).maybeSingle();
  if (cur.error) return NextResponse.json({ error: `查詢失敗: ${cur.error.message}` }, { status: 500 });
  if (!cur.data) return NextResponse.json({ error: '找不到套組' }, { status: 404 });
  const before = cur.data as BundleTemplate;

  const upd = await sb.from('bundle_templates').update({ active: false }).eq('id', id).select('*').single();
  if (upd.error || !upd.data) {
    return NextResponse.json({ error: `停用失敗: ${upd.error?.message ?? 'unknown'}` }, { status: 500 });
  }

  await sb.from('audit_log').insert({
    actor_id: session.id,
    action: 'bundle.deactivate',
    target_table: 'bundle_templates',
    target_id: id,
    diff: { before, after: upd.data },
  });

  return NextResponse.json({ ok: true, bundle: upd.data });
}
