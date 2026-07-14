import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

function parsePrice(v: unknown): number | null | 'invalid' {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) return 'invalid';
  return n;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim();
  const category = searchParams.get('category')?.trim();
  const itemType = searchParams.get('item_type')?.trim();

  const sb = getSupabaseAdmin();
  let query = sb.from('catalog_items').select('*').eq('active', true);
  if (category) query = query.eq('category', category);
  if (itemType) query = query.eq('item_type', itemType);
  if (q) query = query.or(`name.ilike.%${q}%,brand.ilike.%${q}%,item_type.ilike.%${q}%`);
  query = query.order('category', { ascending: true }).order('name', { ascending: true });

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: `查詢失敗: ${error.message}` }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
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
  if (!name) return NextResponse.json({ error: '請填品名' }, { status: 400 });

  const cost = parsePrice(body.cost_price_twd);
  const sell = parsePrice(body.sell_price_twd);
  if (cost === 'invalid') return NextResponse.json({ error: '進價必須是 0 或正整數' }, { status: 400 });
  if (sell === 'invalid') return NextResponse.json({ error: '售價必須是 0 或正整數' }, { status: 400 });

  const sb = getSupabaseAdmin();
  const ins = await sb
    .from('catalog_items')
    .insert({
      brand: typeof body.brand === 'string' && body.brand.trim() ? body.brand.trim() : null,
      name,
      item_type: typeof body.item_type === 'string' && body.item_type.trim() ? body.item_type.trim() : null,
      unit: typeof body.unit === 'string' && body.unit.trim() ? body.unit.trim() : '式',
      cost_price_twd: cost,
      sell_price_twd: sell,
      category: typeof body.category === 'string' && body.category.trim() ? body.category.trim() : null,
      note: typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null,
    })
    .select('*')
    .single();

  if (ins.error || !ins.data) {
    return NextResponse.json({ error: `新增失敗: ${ins.error?.message ?? 'unknown'}` }, { status: 500 });
  }

  await sb.from('audit_log').insert({
    actor_id: session.id,
    action: 'catalog.create',
    target_table: 'catalog_items',
    target_id: ins.data.id,
    diff: { after: ins.data },
  });

  return NextResponse.json({ item: ins.data });
}
