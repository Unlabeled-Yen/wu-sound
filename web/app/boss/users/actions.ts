'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';
import { hashPin } from '@/lib/auth';

async function assertBoss() {
  const session = await getSession();
  if (!session || session.role !== 'boss') {
    throw new Error('權限不足');
  }
  return session;
}

async function audit(actor: string, action: string, id: string, diff: Record<string, unknown>) {
  const sb = getSupabaseAdmin();
  await sb.from('audit_log').insert({
    actor_id: actor,
    action,
    target_table: 'users',
    target_id: id,
    diff,
  });
}

export async function createUser(formData: FormData) {
  const actor = await assertBoss();
  const name = (formData.get('name') as string || '').trim();
  const role = formData.get('role') as string;
  const pin = (formData.get('pin') as string || '').trim();

  if (!name) throw new Error('姓名不得為空');
  if (role !== 'boss' && role !== 'staff') throw new Error('角色不正確');
  if (!/^\d{4}$/.test(pin)) throw new Error('PIN 必須為 4 位數字');

  const sb = getSupabaseAdmin();
  const dup = await sb.from('users').select('id').eq('name', name).maybeSingle();
  if (dup.error) throw new Error(`查詢重名失敗: ${dup.error.message}`);
  if (dup.data) throw new Error(`已有姓名為「${name}」的使用者`);

  const pin_hash = await hashPin(pin);
  const ins = await sb.from('users').insert({ name, role, pin_hash, active: true }).select('id').single();
  if (ins.error) throw new Error(`新增失敗: ${ins.error.message}`);
  await audit(actor.id, 'user.create', ins.data.id as string, { name, role });
  revalidatePath('/boss/users');
  redirect('/boss/users');
}

export async function updateName(formData: FormData) {
  const actor = await assertBoss();
  const id = formData.get('id') as string;
  const name = (formData.get('name') as string || '').trim();
  if (!id) throw new Error('缺少 id');
  if (!name) throw new Error('姓名不得為空');

  const sb = getSupabaseAdmin();
  const cur = await sb.from('users').select('name').eq('id', id).maybeSingle();
  if (cur.error) throw new Error(cur.error.message);
  if (!cur.data) throw new Error('使用者不存在');
  if (cur.data.name === name) return;

  const dup = await sb.from('users').select('id').eq('name', name).neq('id', id).maybeSingle();
  if (dup.error) throw new Error(dup.error.message);
  if (dup.data) throw new Error(`已有姓名為「${name}」的使用者`);

  const upd = await sb.from('users').update({ name }).eq('id', id);
  if (upd.error) throw new Error(`改名失敗: ${upd.error.message}`);
  await audit(actor.id, 'user.rename', id, { before: cur.data.name, after: name });
  revalidatePath('/boss/users');
}

export async function setActive(formData: FormData) {
  const actor = await assertBoss();
  const id = formData.get('id') as string;
  const active = formData.get('active') === 'true';
  if (!id) throw new Error('缺少 id');

  if (!active && id === actor.id) {
    throw new Error('不能停用自己');
  }

  const sb = getSupabaseAdmin();
  const upd = await sb.from('users').update({ active }).eq('id', id);
  if (upd.error) throw new Error(upd.error.message);
  await audit(actor.id, active ? 'user.activate' : 'user.deactivate', id, { active });
  revalidatePath('/boss/users');
}

export async function resetPin(formData: FormData) {
  const actor = await assertBoss();
  const id = formData.get('id') as string;
  const pin = (formData.get('pin') as string || '').trim();
  if (!id) throw new Error('缺少 id');
  if (!/^\d{4}$/.test(pin)) throw new Error('PIN 必須為 4 位數字');

  const sb = getSupabaseAdmin();
  const pin_hash = await hashPin(pin);
  const upd = await sb.from('users').update({ pin_hash }).eq('id', id);
  if (upd.error) throw new Error(upd.error.message);
  await audit(actor.id, 'user.reset_pin', id, {});
  revalidatePath('/boss/users');
}
