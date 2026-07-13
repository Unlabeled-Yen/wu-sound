import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

const EDITABLE_FIELDS = ['name', 'brand', 'model_number', 'serial_number', 'quantity', 'unit', 'notes'] as const;
const FORBIDDEN_FIELDS = ['status', 'current_site_id'] as const;

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });
  if (session.role !== 'boss') return NextResponse.json({ error: '權限不足' }, { status: 403 });
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求' }, { status: 400 });
  }

  for (const f of FORBIDDEN_FIELDS) {
    if (f in body) {
      return NextResponse.json({ error: '此欄位需透過移動變更' }, { status: 400 });
    }
  }

  const patch: Record<string, unknown> = {};
  if ('name' in body) {
    const v = typeof body.name === 'string' ? body.name.trim() : '';
    if (!v) return NextResponse.json({ error: '請填設備名稱' }, { status: 400 });
    patch.name = v;
  }
  if ('brand' in body) {
    patch.brand = typeof body.brand === 'string' && body.brand.trim() ? body.brand.trim() : null;
  }
  if ('model_number' in body) {
    patch.model_number = typeof body.model_number === 'string' && body.model_number.trim() ? body.model_number.trim() : null;
  }
  if ('serial_number' in body) {
    patch.serial_number = typeof body.serial_number === 'string' && body.serial_number.trim() ? body.serial_number.trim() : null;
  }
  if ('unit' in body) {
    const v = typeof body.unit === 'string' ? body.unit.trim() : '';
    if (!v) return NextResponse.json({ error: '請填單位' }, { status: 400 });
    patch.unit = v;
  }
  if ('notes' in body) {
    patch.notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null;
  }
  if ('quantity' in body) {
    const q = typeof body.quantity === 'number' ? body.quantity : parseInt(String(body.quantity ?? ''), 10);
    if (!Number.isFinite(q) || q <= 0 || q > 999999) {
      return NextResponse.json({ error: '數量必須為正整數' }, { status: 400 });
    }
    patch.quantity = Math.floor(q);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: '沒有變更' }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const cur = await sb.from('equipment').select('*').eq('id', id).maybeSingle();
  if (cur.error) return NextResponse.json({ error: `查詢失敗: ${cur.error.message}` }, { status: 500 });
  if (!cur.data) return NextResponse.json({ error: '找不到設備' }, { status: 404 });

  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const k of Object.keys(patch)) {
    before[k] = (cur.data as any)[k];
    after[k] = patch[k];
  }

  const upd = await sb.from('equipment').update(patch).eq('id', id).select('*').single();
  if (upd.error) return NextResponse.json({ error: `更新失敗: ${upd.error.message}` }, { status: 500 });

  await sb.from('audit_log').insert({
    actor_id: session.id,
    action: 'equipment.update',
    target_table: 'equipment',
    target_id: id,
    diff: { before, after },
  });

  return NextResponse.json({ ok: true, equipment: upd.data });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });
  if (session.role !== 'boss') return NextResponse.json({ error: '權限不足' }, { status: 403 });
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });

  const sb = getSupabaseAdmin();
  const cur = await sb.from('equipment').select('*').eq('id', id).maybeSingle();
  if (cur.error) return NextResponse.json({ error: `查詢失敗: ${cur.error.message}` }, { status: 500 });
  if (!cur.data) return NextResponse.json({ error: '找不到設備' }, { status: 404 });

  if (cur.data.status === 'retired') {
    return NextResponse.json({ error: '此設備已淘汰' }, { status: 400 });
  }

  const before = { status: cur.data.status, current_site_id: cur.data.current_site_id };
  const after = { status: 'retired' as const, current_site_id: null };

  const upd = await sb.from('equipment').update(after).eq('id', id);
  if (upd.error) return NextResponse.json({ error: `刪除失敗: ${upd.error.message}` }, { status: 500 });

  await sb.from('equipment_movements').insert({
    equipment_id: id,
    moved_by: session.id,
    from_status: before.status,
    to_status: 'retired',
    from_site_id: before.current_site_id,
    to_site_id: null,
    notes: '軟刪除:淘汰',
  });

  await sb.from('audit_log').insert({
    actor_id: session.id,
    action: 'equipment.retire',
    target_table: 'equipment',
    target_id: id,
    diff: { before, after },
  });

  return NextResponse.json({ ok: true });
}
