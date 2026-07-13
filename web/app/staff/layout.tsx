import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'staff') redirect('/boss');

  const sb = getSupabaseAdmin();
  const { count } = await sb
    .from('expenses')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', session.id)
    .eq('status', 'draft');
  const draftCount = count ?? 0;

  const tabs: { href: string; label: string; badge?: number }[] = [
    { href: '/staff/capture', label: '相機' },
    { href: '/staff/queue', label: '待確認', badge: draftCount },
    { href: '/staff/worklogs', label: '工作記錄' },
    { href: '/staff/clockins', label: '打卡' },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-full">
      <main className="flex-1 pb-20">{children}</main>
      <nav className="fixed bottom-0 inset-x-0 z-40 bg-white dark:bg-neutral-950 border-t border-neutral-200 dark:border-neutral-800 grid grid-cols-5 text-xs">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="flex flex-col items-center justify-center py-2 gap-0.5 text-neutral-700 dark:text-neutral-300 active:bg-neutral-100 dark:active:bg-neutral-900 relative"
          >
            <span>{t.label}</span>
            {t.badge && t.badge > 0 ? (
              <span className="absolute top-1 right-1/4 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] leading-[18px] text-center font-medium">
                {t.badge}
              </span>
            ) : null}
          </Link>
        ))}
        <form action="/api/auth/logout" method="post" className="contents">
          <button
            type="submit"
            className="flex flex-col items-center justify-center py-2 text-neutral-700 dark:text-neutral-300 active:bg-neutral-100 dark:active:bg-neutral-900"
          >
            登出
          </button>
        </form>
      </nav>
    </div>
  );
}
