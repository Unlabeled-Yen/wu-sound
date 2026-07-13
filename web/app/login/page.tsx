import { redirect } from 'next/navigation';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getSession } from '@/lib/session';
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
    redirect(session.role === 'boss' ? '/boss' : '/staff');
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
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-10 bg-neutral-50 dark:bg-neutral-950">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold mb-6 text-center">聲生工作系統</h1>
        <LoginForm users={users} />
      </div>
    </main>
  );
}
