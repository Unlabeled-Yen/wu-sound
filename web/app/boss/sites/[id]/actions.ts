'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';

async function assertBoss() {
  const session = await getSession();
  if (!session || session.role !== 'boss') throw new Error('權限不足');
  return session;
}

const MAX_PINNED = 5;

export async function addSiteNote(formData: FormData) {
  const actor = await assertBoss();
  const siteId = (formData.get('site_id') as string || '').trim();
  const zone = (formData.get('zone') as string || '').trim();
  const content = (formData.get('content') as string || '').trim();
  if (!siteId || !content) throw new Error('缺少必要欄位');

  const sb = getSupabaseAdmin();
  const { error } = await sb.from('site_notes').insert({
    site_id: siteId,
    zone,
    content,
    created_by: actor.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/boss/sites/${siteId}`);
}

export async function togglePinNote(formData: FormData) {
  const actor = await assertBoss();
  const noteId = (formData.get('note_id') as string || '').trim();
  const siteId = (formData.get('site_id') as string || '').trim();
  const currentlyPinned = formData.get('is_pinned') === 'true';
  if (!noteId || !siteId) throw new Error('缺少必要欄位');

  const sb = getSupabaseAdmin();

  if (!currentlyPinned) {
    const { count } = await sb
      .from('site_notes')
      .select('id', { count: 'exact', head: true })
      .eq('site_id', siteId)
      .eq('is_pinned', true);
    if ((count ?? 0) >= MAX_PINNED) throw new Error(`釘選上限 ${MAX_PINNED} 則`);
  }

  const { error } = await sb
    .from('site_notes')
    .update({ is_pinned: !currentlyPinned, updated_at: new Date().toISOString() })
    .eq('id', noteId);
  if (error) throw new Error(error.message);
  revalidatePath(`/boss/sites/${siteId}`);
}

export async function promoteToChecklist(formData: FormData) {
  const actor = await assertBoss();
  const noteId = (formData.get('note_id') as string || '').trim();
  const siteId = (formData.get('site_id') as string || '').trim();
  if (!noteId || !siteId) throw new Error('缺少必要欄位');

  const sb = getSupabaseAdmin();
  const { error } = await sb
    .from('site_notes')
    .update({ is_checklist: true, updated_at: new Date().toISOString() })
    .eq('id', noteId);
  if (error) throw new Error(error.message);
  revalidatePath(`/boss/sites/${siteId}`);
}

export async function deleteSiteNote(formData: FormData) {
  const actor = await assertBoss();
  const noteId = (formData.get('note_id') as string || '').trim();
  const siteId = (formData.get('site_id') as string || '').trim();
  if (!noteId || !siteId) throw new Error('缺少必要欄位');

  const sb = getSupabaseAdmin();
  const { error } = await sb.from('site_notes').delete().eq('id', noteId);
  if (error) throw new Error(error.message);
  revalidatePath(`/boss/sites/${siteId}`);
}
