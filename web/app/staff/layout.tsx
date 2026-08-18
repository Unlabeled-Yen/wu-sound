import type { Viewport } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { BossShell } from '@/app/boss/_shell/BossShell';
import { STAFF_MOBILE_ENABLED, viewportForRole } from '@/lib/view-mode';
import StaffMobileShell from './_shell/StaffMobileShell';

export const dynamic = 'force-dynamic';

export async function generateViewport(): Promise<Viewport> {
  const session = await getSession();
  return viewportForRole(session?.role ?? null);
}

// 員工桌面版鎖定期間(docs/desktop-lock-and-staff-access-spec-v1.md),
// 這裡一律掛 BossShell(跟 /boss/* 共用同一套桌面殼層,側欄依角色過濾)。
// 舊的手機殼層搬到 ./_shell/StaffMobileShell.tsx,原封不動保留,
// STAFF_MOBILE_ENABLED 改回 true 時自動切回去,不必再動這支檔案。
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'staff') redirect('/boss');

  if (STAFF_MOBILE_ENABLED) {
    return <StaffMobileShell>{children}</StaffMobileShell>;
  }
  return <BossShell role={session.role}>{children}</BossShell>;
}
