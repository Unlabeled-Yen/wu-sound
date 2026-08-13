import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { BossShell } from './_shell/BossShell';

export const dynamic = 'force-dynamic';

export default async function BossLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'boss') redirect('/staff');

  // Note: pending count is fetched client-side by BossShell after mount
  // (was blocking every /boss/* nav with a Supabase count query — ~150-400ms).
  return <BossShell>{children}</BossShell>;
}
