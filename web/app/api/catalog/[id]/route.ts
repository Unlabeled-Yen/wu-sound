import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { can } from '@/lib/acl';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { CatalogItem } from '@/lib/types';

export const runtime = 'nodejs';

function parsePrice(v: unknown): number | null | 'invalid' {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) return 'invalid';
  return n;
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });
  if (!can(session.role, 'quotes')) return NextResponse.json({ error: '權限不足' }, { status: 403 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: '無效的請求' }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const cur = await sb.from('catalog_items').select('*').eq('id', id).maybeSingle();
  if (cur.error) return NextResponse.json({ error: `查詢失敗: ${cur.error.message}` }, { status: 500 });
  if (!cur.data) return NextResponse.json({ error: '找不到品項' }, { status: 404 });
  const before = cur.data as CatalogItem;

  const patch: Record<string, unknown> = {};

  if ('brand' in body) patch.brand = typeof body.brand === 'string' && body.brand.trim() ? body.brand.trim() : null;
  if ('name' in body) {
    const nm = typeof body.name === 'string' ? body.name.trim() : '';
    if (!nm) return NextResponse.json({ error: '品名不可為空' }, { status: 400 });
    patch.name = nm;
  }
  if ('item_type' in body) patch.item_type = typeof body.item_type === 'string' && body.item_type.trim() ? body.item_type.trim() : null;
  if ('unit' in body) patch.unit = typeof body.unit === 'string' && body.unit.trim() ? body.unit.trim() : '式';
  if ('category' in body) patch.category = typeof body.category === 'string' && body.category.trim() ? body.category.trim() : null;
  if ('note' in body) patch.note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null;
  if ('active' in body) patch.active = Boolean(body.active);

  if ('cost_price_twd' in body) {
    const c = parsePrice(body.cost_price_twd);
    if (c === 'invalid') return NextResponse.json({ error: '進價必須是 0 或正整數' }, { status: 400 });
    patch.cost_price_twd = c;
  }
  if ('sell_price_twd' in body) {
    const s = parsePrice(body.sell_price_twd);
    if (s === 'invalid') return NextResponse.json({ error: '售價必須是 0 或正整數' }, { status: 400 });
    patch.sell_price_twd = s;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: '沒有可更新的欄位' }, { status: 400 });
  }

  const upd = await sb.from('catalog_items').update(patch).eq('id', id).select('*').single();
  if (upd.error || !upd.data) {
    return NextResponse.json({ error: `更新失敗: ${upd.error?.message ?? 'unknown'}` }, { status: 500 });
  }

  await sb.from('audit_log').insert({
    actor_id: session.id,
    action: 'catalog.update',
    target_table: 'catalog_items',
    target_id: id,
    diff: { before, after: upd.data },
  });

  return NextResponse.json({ item: upd.data });
}
