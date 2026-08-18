import type { Viewport } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { BossShell } from '@/app/boss/_shell/BossShell';
import PageTabs from '@/app/_shared/PageTabs';
import { ACOUSTIC_TABS } from '@/lib/nav';
import { STAFF_MOBILE_ENABLED, viewportForRole } from '@/lib/view-mode';

export const dynamic = 'force-dynamic';

export async function generateViewport(): Promise<Viewport> {
  const session = await getSession();
  return viewportForRole(session?.role ?? null);
}

// 老闆/員工共用工具區。老闆掛在 BossShell 底下(桌機側欄常駐,跟其他 /boss/* 頁一致);
// 員工桌面版鎖定期間(STAFF_MOBILE_ENABLED=false)一律走 BossShell,
// 跟 /boss/*、/staff/* 一致。員工手機版恢復後,退回原本的極簡「← 返回」頭。
export default async function ToolsLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const content = (
    <div className="relative z-[1] flex-1 flex flex-col min-h-full max-w-[640px] lg:max-w-[1040px] w-full mx-auto px-[22px] py-6 lg:px-0 lg:py-0">
      <PageTabs tabs={ACOUSTIC_TABS} />
      <main className="flex-1">{children}</main>
    </div>
  );

  if (session.role === 'boss' || !STAFF_MOBILE_ENABLED) {
    return <BossShell role={session.role}>{content}</BossShell>;
  }

  return (
    <div className="relative z-[1] flex-1 flex flex-col min-h-full max-w-[640px] lg:max-w-[1040px] w-full mx-auto px-[22px] py-6">
      <div className="mb-4">
        <Link href="/staff/settings" className="text-[13px] hover:underline nm-focus" style={{ color: 'var(--nm-text-muted)' }}>
          ← 返回
        </Link>
      </div>
      <PageTabs tabs={ACOUSTIC_TABS} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
