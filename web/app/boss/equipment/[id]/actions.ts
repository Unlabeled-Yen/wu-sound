'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';
import { computeChangedFields, retireEquipmentCore } from '@/lib/equipment-actions';

interface Result {
  ok: boolean;
  error?: string;
}

async function assertBoss() {
  const session = await getSession();
  if (!session) return { session: null, err: '未登入' };
  if (session.role !== 'boss') return { session: null, err: '權限不足' };
  return { session, err: null };
}

function readStr(v: FormDataEntryValue | null): string {
  return typeof v === 'string' ? v.trim() : '';
}

export async function updateEquipment(id: string, formData: FormData): Promise<Result> {
  const { session, err } = await assertBoss();
  if (!session) return { ok: false, error: err ?? '未登入' };
  if (!id) return { ok: false, error: '缺少 id' };

  const name = readStr(formData.get('name'));
  if (!name) return { ok: false, error: '請填設備名稱' };

  const brand = readStr(formData.get('brand')) || null;
  const model_number = readStr(formData.get('model_number')) || null;
  const serial_number = readStr(formData.get('serial_number')) || null;
  const notes = readStr(formData.get('notes')) || null;
  const unit = readStr(formData.get('unit')) || '台';

  const qnRaw = readStr(formData.get('quantity'));
  const qn = qnRaw ? parseInt(qnRaw, 10) : 1;
  if (!Number.isFinite(qn) || qn <= 0 || qn > 999999) {
    return { ok: false, error: '數量必須為正整數' };
  }

  const sb = getSupabaseAdmin();
  const cur = await sb.from('equipment').select('*').eq('id', id).maybeSingle();
  if (cur.error) return { ok: false, error: `查詢失敗: ${cur.error.message}` };
  if (!cur.data) return { ok: false, error: '找不到設備' };

  const patch = { name, brand, model_number, serial_number, notes, unit, quantity: qn };
  const { before, after } = computeChangedFields(cur.data as Record<string, unknown>, patch);
  if (Object.keys(after).length === 0) {
    return { ok: true };
  }

  const upd = await sb.from('equipment').update(patch).eq('id', id);
  if (upd.error) return { ok: false, error: `更新失敗: ${upd.error.message}` };

  await sb.from('audit_log').insert({
    actor_id: session.id,
    action: 'equipment.update',
    target_table: 'equipment',
    target_id: id,
    diff: { before, after },
  });

  revalidatePath(`/boss/equipment/${id}`);
  revalidatePath('/boss/equipment');
  return { ok: true };
}

export async function retireEquipment(id: string): Promise<Result> {
  const { session, err } = await assertBoss();
  if (!session) return { ok: false, error: err ?? '未登入' };
  if (!id) return { ok: false, error: '缺少 id' };

  const sb = getSupabaseAdmin();
  const result = await retireEquipmentCore(sb, id, session.id);
  if (!result.ok) return result;

  revalidatePath(`/boss/equipment/${id}`);
  revalidatePath('/boss/equipment');
  return { ok: true };
}
