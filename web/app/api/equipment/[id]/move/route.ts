import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { can } from '@/lib/acl';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { EquipmentStatus } from '@/lib/types';
import { validateMove } from '@/lib/equipment-validation';

export const runtime = 'nodejs';

const STATUSES: EquipmentStatus[] = ['in_storage', 'on_site', 'in_repair', 'retired'];

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });
  if (!can(session.role, 'equipment')) return NextResponse.json({ error: '權限不足' }, { status: 403 });
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });

  let body: { to_status?: unknown; to_site_id?: unknown; notes?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求' }, { status: 400 });
  }

  if (typeof body.to_status !== 'string' || !STATUSES.includes(body.to_status as EquipmentStatus)) {
    return NextResponse.json({ error: '狀態無效' }, { status: 400 });
  }
  const to_status = body.to_status as EquipmentStatus;
  const to_site_id = typeof body.to_site_id === 'string' && body.to_site_id ? body.to_site_id : null;
  const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null;

  const sb = getSupabaseAdmin();
  const cur = await sb.from('equipment').select('*').eq('id', id).maybeSingle();
  if (cur.error) return NextResponse.json({ error: `查詢失敗: ${cur.error.message}` }, { status: 500 });
  if (!cur.data) return NextResponse.json({ error: '找不到設備' }, { status: 404 });

  const err = validateMove({
    to_status,
    to_site_id,
    current_status: cur.data.status,
    current_site_id: cur.data.current_site_id,
  });
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  if (to_site_id) {
    const site = await sb.from('sites').select('id').eq('id', to_site_id).maybeSingle();
    if (site.error) return NextResponse.json({ error: `專案查詢失敗: ${site.error.message}` }, { status: 500 });
    if (!site.data) return NextResponse.json({ error: '找不到指定專案' }, { status: 400 });
  }

  const before = { status: cur.data.status, current_site_id: cur.data.current_site_id };
  const after = { status: to_status, current_site_id: to_site_id };

  const upd = await sb.from('equipment').update(after).eq('id', id);
  if (upd.error) return NextResponse.json({ error: `移動失敗: ${upd.error.message}` }, { status: 500 });

  const mv = await sb.from('equipment_movements').insert({
    equipment_id: id,
    moved_by: session.id,
    from_status: before.status,
    to_status,
    from_site_id: before.current_site_id,
    to_site_id,
    notes,
  });
  if (mv.error) {
    return NextResponse.json({ error: `記錄移動失敗: ${mv.error.message}` }, { status: 500 });
  }

  await sb.from('audit_log').insert({
    actor_id: session.id,
    action: 'equipment.move',
    target_table: 'equipment',
    target_id: id,
    diff: { before, after, notes },
  });

  return NextResponse.json({ ok: true, id });
}
