import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { BossShell } from './_shell/BossShell';

export const dynamic = 'force-dynamic';

export default async function BossLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'boss') redirect('/staff');

  return <BossShell userName={session.name}>{children}</BossShell>;
}
