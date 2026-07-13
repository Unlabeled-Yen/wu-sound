import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { EquipmentCategory, EquipmentStatus } from '@/lib/types';
import { EQUIPMENT_STATUS_ORDER } from '@/lib/equipment-validation';

export const runtime = 'nodejs';

const CATEGORIES: EquipmentCategory[] = [
  'speaker', 'subwoofer', 'amplifier', 'mixer',
  'mic_wired', 'mic_wireless', 'di_box',
  'light', 'light_console', 'stage', 'projector', 'rack', 'other',
];
const STATUSES: EquipmentStatus[] = ['in_storage', 'on_site', 'in_repair', 'retired'];

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim();
  const category = url.searchParams.get('category') || '';
  const status = url.searchParams.get('status') || '';
  const site_id = url.searchParams.get('site_id') || '';
  const limitRaw = parseInt(url.searchParams.get('limit') || '200', 10);
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 200, 1), 500);

  const sb = getSupabaseAdmin();
  let query = sb
    .from('equipment')
    .select('id, name, brand, model_number, category, serial_number, quantity, unit, status, current_site_id, notes, created_at, updated_at, sites:current_site_id(name)')
    .limit(limit);

  if (q) {
    const like = `%${q.replace(/[%_]/g, '')}%`;
    query = query.or(`name.ilike.${like},model_number.ilike.${like},brand.ilike.${like}`);
  }
  if (category && CATEGORIES.includes(category as EquipmentCategory)) {
    query = query.eq('category', category);
  }
  if (status && STATUSES.includes(status as EquipmentStatus)) {
    query = query.eq('status', status);
  }
  if (site_id) {
    query = query.eq('current_site_id', site_id);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: `讀取設備失敗: ${error.message}` }, { status: 500 });
  }

  const rows = (data || []).slice().sort((a: any, b: any) => {
    const sa = EQUIPMENT_STATUS_ORDER[a.status as EquipmentStatus] ?? 99;
    const sb2 = EQUIPMENT_STATUS_ORDER[b.status as EquipmentStatus] ?? 99;
    if (sa !== sb2) return sa - sb2;
    return String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hant');
  });

  return NextResponse.json({ ok: true, equipment: rows });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });
  if (session.role !== 'boss') return NextResponse.json({ error: '權限不足' }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: '請填設備名稱' }, { status: 400 });

  const category = body.category;
  if (typeof category !== 'string' || !CATEGORIES.includes(category as EquipmentCategory)) {
    return NextResponse.json({ error: '分類無效' }, { status: 400 });
  }

  const brand = typeof body.brand === 'string' && body.brand.trim() ? body.brand.trim() : null;
  const model_number = typeof body.model_number === 'string' && body.model_number.trim() ? body.model_number.trim() : null;
  const serial_number = typeof body.serial_number === 'string' && body.serial_number.trim() ? body.serial_number.trim() : null;
  const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null;
  const unit = typeof body.unit === 'string' && body.unit.trim() ? body.unit.trim() : '台';

  let quantity = 1;
  if (body.quantity !== undefined && body.quantity !== null && body.quantity !== '') {
    const q = typeof body.quantity === 'number' ? body.quantity : parseInt(String(body.quantity), 10);
    if (!Number.isFinite(q) || q <= 0 || q > 999999) {
      return NextResponse.json({ error: '數量必須為正整數' }, { status: 400 });
    }
    quantity = Math.floor(q);
  }

  const sb = getSupabaseAdmin();
  const insert = await sb
    .from('equipment')
    .insert({
      name,
      brand,
      model_number,
      category,
      serial_number,
      quantity,
      unit,
      notes,
      status: 'in_storage' as EquipmentStatus,
      current_site_id: null,
    })
    .select('*')
    .single();

  if (insert.error) {
    return NextResponse.json({ error: `新增失敗: ${insert.error.message}` }, { status: 500 });
  }

  await sb.from('audit_log').insert({
    actor_id: session.id,
    action: 'equipment.create',
    target_table: 'equipment',
    target_id: insert.data.id,
    diff: { after: insert.data },
  });

  return NextResponse.json({ ok: true, equipment: insert.data }, { status: 201 });
}
