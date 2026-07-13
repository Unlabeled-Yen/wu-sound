import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function BossLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'boss') redirect('/staff');

  const links: { href: string; label: string }[] = [
    { href: '/boss/expenses', label: '零用金審核' },
    { href: '/boss/close', label: '月結' },
    { href: '/boss/equipment', label: '設備' },
    { href: '/boss/worklogs', label: '工作記錄' },
    { href: '/boss/clockins', label: '打卡' },
    { href: '/boss/sites', label: '案場管理' },
    { href: '/boss/users', label: '使用者管理' },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-full bg-neutral-50 dark:bg-neutral-950">
      <header className="border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <span className="font-semibold">聲生工作系統</span>
            <nav className="flex gap-4 text-sm">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="text-neutral-700 dark:text-neutral-300 hover:underline"
                >
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-neutral-500">{session.name}</span>
            <form action="/api/auth/logout" method="post">
              <button type="submit" className="text-neutral-700 dark:text-neutral-300 underline">
                登出
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">{children}</main>
    </div>
  );
}
