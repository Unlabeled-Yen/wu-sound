'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';

async function assertBoss() {
  const session = await getSession();
  if (!session || session.role !== 'boss') throw new Error('權限不足');
  return session;
}

async function audit(actor: string, action: string, id: string, diff: Record<string, unknown>) {
  const sb = getSupabaseAdmin();
  await sb.from('audit_log').insert({
    actor_id: actor,
    action,
    target_table: 'sites',
    target_id: id,
    diff,
  });
}

export async function createSite(formData: FormData) {
  const actor = await assertBoss();
  const name = (formData.get('name') as string || '').trim();
  if (!name) throw new Error('專案名稱不得為空');
  const categoryId = (formData.get('category_id') as string || '').trim() || null;
  const customerName = (formData.get('customer_name') as string || '').trim() || null;

  const sb = getSupabaseAdmin();
  const dup = await sb.from('sites').select('id').eq('name', name).maybeSingle();
  if (dup.error) throw new Error(dup.error.message);
  if (dup.data) throw new Error(`已有專案「${name}」`);

  const ins = await sb
    .from('sites')
    .insert({ name, active: true, category_id: categoryId, customer_name: customerName })
    .select('id')
    .single();
  if (ins.error) throw new Error(ins.error.message);
  await audit(actor.id, 'site.create', ins.data.id as string, { name, category_id: categoryId, customer_name: customerName });
  revalidatePath('/boss/sites');
}

export async function updateSiteMeta(formData: FormData) {
  const actor = await assertBoss();
  const id = formData.get('id') as string;
  if (!id) throw new Error('缺少 id');
  const categoryId = (formData.get('category_id') as string || '').trim() || null;
  const customerName = (formData.get('customer_name') as string || '').trim() || null;

  const sb = getSupabaseAdmin();
  const cur = await sb.from('sites').select('category_id, customer_name').eq('id', id).maybeSingle();
  if (cur.error) throw new Error(cur.error.message);
  if (!cur.data) throw new Error('專案不存在');

  const upd = await sb
    .from('sites')
    .update({ category_id: categoryId, customer_name: customerName })
    .eq('id', id);
  if (upd.error) throw new Error(upd.error.message);
  await audit(actor.id, 'site.update_meta', id, { before: cur.data, after: { category_id: categoryId, customer_name: customerName } });
  revalidatePath('/boss/sites');
}

export async function createSiteCategory(formData: FormData) {
  const actor = await assertBoss();
  const name = (formData.get('name') as string || '').trim();
  if (!name) throw new Error('類別名稱不得為空');

  const sb = getSupabaseAdmin();
  const dup = await sb.from('site_categories').select('id').eq('name', name).maybeSingle();
  if (dup.error) throw new Error(dup.error.message);
  if (dup.data) throw new Error(`已有類別「${name}」`);

  const ins = await sb.from('site_categories').insert({ name, active: true }).select('id').single();
  if (ins.error) throw new Error(ins.error.message);
  await sb.from('audit_log').insert({
    actor_id: actor.id,
    action: 'site_category.create',
    target_table: 'site_categories',
    target_id: ins.data.id as string,
    diff: { name },
  });
  revalidatePath('/boss/sites');
}

export async function renameSite(formData: FormData) {
  const actor = await assertBoss();
  const id = formData.get('id') as string;
  const name = (formData.get('name') as string || '').trim();
  if (!id) throw new Error('缺少 id');
  if (!name) throw new Error('名稱不得為空');

  const sb = getSupabaseAdmin();
  const cur = await sb.from('sites').select('name').eq('id', id).maybeSingle();
  if (cur.error) throw new Error(cur.error.message);
  if (!cur.data) throw new Error('專案不存在');
  if (cur.data.name === name) return;

  const dup = await sb.from('sites').select('id').eq('name', name).neq('id', id).maybeSingle();
  if (dup.error) throw new Error(dup.error.message);
  if (dup.data) throw new Error(`已有專案「${name}」`);

  const upd = await sb.from('sites').update({ name }).eq('id', id);
  if (upd.error) throw new Error(upd.error.message);
  await audit(actor.id, 'site.rename', id, { before: cur.data.name, after: name });
  revalidatePath('/boss/sites');
}

export async function setSiteActive(formData: FormData) {
  const actor = await assertBoss();
  const id = formData.get('id') as string;
  const active = formData.get('active') === 'true';
  if (!id) throw new Error('缺少 id');

  const sb = getSupabaseAdmin();

  if (!active) {
    // Guard: cannot deactivate site with equipment currently on-site there
    const inUse = await sb
      .from('equipment')
      .select('id', { count: 'exact', head: true })
      .eq('current_site_id', id)
      .eq('status', 'on_site');
    if (inUse.error) throw new Error(inUse.error.message);
    if ((inUse.count ?? 0) > 0) {
      throw new Error(`專案中還有 ${inUse.count} 件設備,請先把設備移回庫房再停用`);
    }
  }

  const upd = await sb.from('sites').update({ active }).eq('id', id);
  if (upd.error) throw new Error(upd.error.message);
  await audit(actor.id, active ? 'site.activate' : 'site.deactivate', id, { active });
  revalidatePath('/boss/sites');
}
