import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function RootPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  // 員工桌面版落地頁跟老闆一致,一律先到 /boss——員工不該有一個老闆桌面版
  // 不存在的專屬落地頁(見 docs/desktop-lock-and-staff-access-spec-v1.md)。
  redirect('/boss');
}
