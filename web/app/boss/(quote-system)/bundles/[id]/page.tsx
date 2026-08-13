import { redirect } from 'next/navigation';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { BundleLine, BundleTemplate } from '@/lib/types';
import BundleEditor from './BundleEditor';

export const dynamic = 'force-dynamic';

export default async function BundleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = getSupabaseAdmin();

  const b = await sb.from('bundle_templates').select('*').eq('id', id).maybeSingle();
  if (b.error || !b.data) redirect('/boss/bundles');
  const bundle = b.data as BundleTemplate;

  const l = await sb
    .from('bundle_lines')
    .select('*')
    .eq('bundle_id', id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  const lines = (l.data ?? []) as BundleLine[];

  return <BundleEditor bundle={bundle} initialLines={lines} />;
}
