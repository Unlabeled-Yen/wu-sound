import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// 老闆/員工共用工具區(跟報價、打卡等角色限定頁不同,不掛在 BossShell/StaffLayout 底下)。
export default async function ToolsLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

  // 老闆桌機側欄沒有 /boss/more(那是手機底部才有的頁面),回那裡等於斷路——改回總覽。
  const backHref = session.role === 'boss' ? '/boss' : '/staff/settings';

  return (
    <div className="relative z-[1] flex-1 flex flex-col min-h-full max-w-[640px] lg:max-w-[1040px] w-full mx-auto px-[22px] py-6">
      <div className="mb-4">
        <Link href={backHref} className="text-[13px] hover:underline nm-focus" style={{ color: 'var(--nm-text-muted)' }}>
          ← 返回
        </Link>
      </div>
      <main className="flex-1">{children}</main>
    </div>
  );
}
