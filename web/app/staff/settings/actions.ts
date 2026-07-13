'use server';

import bcrypt from 'bcryptjs';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';
import { hashPin } from '@/lib/auth';

export async function changeOwnPin(formData: FormData) {
  const session = await getSession();
  if (!session) throw new Error('未登入');

  const current = (formData.get('current_pin') as string || '').trim();
  const next = (formData.get('new_pin') as string || '').trim();
  const confirm = (formData.get('new_pin_confirm') as string || '').trim();

  if (!/^\d{4}$/.test(current)) throw new Error('目前 PIN 格式不對');
  if (!/^\d{4}$/.test(next)) throw new Error('新 PIN 必須為 4 位數字');
  if (next !== confirm) throw new Error('兩次新 PIN 不一致');
  if (next === current) throw new Error('新 PIN 不可與舊 PIN 相同');

  const sb = getSupabaseAdmin();
  const cur = await sb.from('users').select('pin_hash').eq('id', session.id).maybeSingle();
  if (cur.error) throw new Error(cur.error.message);
  if (!cur.data) throw new Error('使用者不存在');

  const ok = await bcrypt.compare(current, cur.data.pin_hash as string);
  if (!ok) throw new Error('目前 PIN 錯誤');

  const pin_hash = await hashPin(next);
  const upd = await sb.from('users').update({ pin_hash }).eq('id', session.id);
  if (upd.error) throw new Error(upd.error.message);

  await sb.from('audit_log').insert({
    actor_id: session.id,
    action: 'user.change_own_pin',
    target_table: 'users',
    target_id: session.id,
    diff: {},
  });

  redirect('/staff/settings?ok=1');
}
