import { redirect } from 'next/navigation';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getSession } from '@/lib/session';
import { STAFF_MOBILE_ENABLED } from '@/lib/view-mode';
import type { UserRole } from '@/lib/types';
import LoginForm from './LoginForm';

interface ActiveUser {
  id: string;
  name: string;
  role: UserRole;
}

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const session = await getSession();
  if (session) {
    // 落地頁邏輯見 app/page.tsx 同名註解:手機版鎖著時員工也是 /boss,
    // 解鎖後員工落地 /staff。
    if (session.role !== 'boss' && STAFF_MOBILE_ENABLED) redirect('/staff');
    redirect('/boss');
  }

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('users')
    .select('id, name, role')
    .eq('active', true)
    .order('role', { ascending: true })
    .order('name', { ascending: true });
  if (error) {
    throw new Error(`Supabase 查詢使用者清單失敗: ${error.message}`);
  }
  const users: ActiveUser[] = (data ?? []) as ActiveUser[];

  return (
    <main className="relative z-[1] flex-1 flex items-center justify-center px-4 py-8 md:px-6 md:py-10">
      <LoginForm users={users} />
    </main>
  );
}
