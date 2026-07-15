import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';
import { BossShell } from './_shell/BossShell';

export const dynamic = 'force-dynamic';

export default async function BossLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'boss') redirect('/staff');

  const sb = getSupabaseAdmin();
  const { count } = await sb
    .from('expenses')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'submitted');
  const pendingCount = count ?? 0;

  return (
    <BossShell userName={session.name} pendingCount={pendingCount}>
      {children}
    </BossShell>
  );
}
