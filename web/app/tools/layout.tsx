import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { BossShell } from '@/app/boss/_shell/BossShell';
import PageTabs from '@/app/_shared/PageTabs';
import { ACOUSTIC_TABS } from '@/lib/nav';

export const dynamic = 'force-dynamic';

// 老闆/員工共用工具區。老闆掛在 BossShell 底下(桌機側欄常駐,跟其他 /boss/* 頁一致);
// 員工是純手機使用者、沒有側欄概念,維持原本的極簡「← 返回」頭。
export default async function ToolsLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const content = (
    <div className="relative z-[1] flex-1 flex flex-col min-h-full max-w-[640px] lg:max-w-[1040px] w-full mx-auto px-[22px] py-6 lg:px-0 lg:py-0">
      <PageTabs tabs={ACOUSTIC_TABS} />
      <main className="flex-1">{children}</main>
    </div>
  );

  if (session.role === 'boss') {
    return <BossShell userName={session.name}>{content}</BossShell>;
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
