import type { Viewport } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { viewportForRole } from '@/lib/view-mode';
import { BossShell } from './_shell/BossShell';

export const dynamic = 'force-dynamic';

// /boss/* 現在是老闆與員工共用的路由(員工桌面版複用同一套殼層,見
// docs/desktop-lock-and-staff-access-spec-v1.md §8),所以鎖桌面與否要看
// 這個 request 的角色,不能是整段固定的靜態 viewport。
export async function generateViewport(): Promise<Viewport> {
  const session = await getSession();
  return viewportForRole(session?.role ?? null);
}

// 這層只確認「有登入」。財務/標案/使用者管理三塊禁區不在這裡擋員工——
// 那樣會變成「整個 /boss/* 都是老闆專屬」的舊行為,跟員工桌面版共用
// /boss/* 底下的報價/設備/專案/現場頁面互相矛盾。改成每支受限頁面
// 自己呼叫 requirePageCapability(見 lib/require-capability.ts),
// 這裡只負責掛殼層。見 docs/desktop-lock-and-staff-access-spec-v1.md §5.2。
export default async function BossLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

  // Note: pending count is fetched client-side by BossShell after mount
  // (was blocking every /boss/* nav with a Supabase count query — ~150-400ms).
  return <BossShell role={session.role}>{children}</BossShell>;
}
