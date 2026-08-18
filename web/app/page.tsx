import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { STAFF_MOBILE_ENABLED } from '@/lib/view-mode';

export const dynamic = 'force-dynamic';

export default async function RootPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  // 手機版鎖著時,員工落地頁跟老闆一致一律 /boss——員工不該有一個老闆桌面版
  // 不存在的專屬落地頁(見 docs/desktop-lock-and-staff-access-spec-v1.md)。
  // 手機版解鎖後,員工才落地 /staff(自己的現場工具 + AI 入口),
  // 這時是「跟裝置走」的合理差異,不再是違反那條原則。
  if (session.role === 'boss' || !STAFF_MOBILE_ENABLED) redirect('/boss');
  redirect('/staff');
}
