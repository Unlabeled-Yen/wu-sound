import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { UserRole } from '@/lib/types';
import { setActive, updateName, resetPin } from './actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Row {
  id: string;
  name: string;
  role: UserRole;
  active: boolean;
  created_at: string;
}

const ROLE_LABEL: Record<UserRole, string> = { boss: '老闆', staff: '員工' };

export default async function BossUsersPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'boss') redirect('/staff');

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('users')
    .select('id, name, role, active, created_at')
    .order('active', { ascending: false })
    .order('role', { ascending: false })
    .order('name');

  const users = (data || []) as Row[];

  return (
    <div>
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold">使用者管理</h1>
          <p className="text-sm text-neutral-500 mt-0.5">共 {users.length} 人。停用後該帳號無法登入,但歷史紀錄保留。</p>
        </div>
        <Link
          href="/boss/users/new"
          className="rounded bg-neutral-900 dark:bg-white text-white dark:text-black px-3 py-1.5 text-sm"
        >
          新增使用者
        </Link>
      </div>

      {error ? (
        <div className="rounded border border-red-300 bg-red-50 text-red-700 p-3 text-sm mb-4">
          讀取失敗:{error.message}
        </div>
      ) : null}

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-neutral-500 border-b border-neutral-200 dark:border-neutral-800">
            <th className="py-2 pr-3">姓名</th>
            <th className="py-2 pr-3">角色</th>
            <th className="py-2 pr-3">狀態</th>
            <th className="py-2 pr-3">建立時間</th>
            <th className="py-2 pr-3">動作</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b border-neutral-100 dark:border-neutral-900">
              <td className="py-2 pr-3">
                <form action={updateName} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={u.id} />
                  <input
                    name="name"
                    defaultValue={u.name}
                    className="border-b border-transparent focus:border-neutral-400 outline-none bg-transparent"
                  />
                  <button
                    type="submit"
                    className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
                  >
                    存
                  </button>
                </form>
              </td>
              <td className="py-2 pr-3">{ROLE_LABEL[u.role]}</td>
              <td className="py-2 pr-3">
                {u.active ? (
                  <span className="text-emerald-700 dark:text-emerald-400">啟用中</span>
                ) : (
                  <span className="text-neutral-500 line-through">已停用</span>
                )}
              </td>
              <td className="py-2 pr-3 text-neutral-500 text-xs">
                {new Date(u.created_at).toLocaleDateString('zh-TW')}
              </td>
              <td className="py-2 pr-3">
                <div className="flex flex-wrap gap-2">
                  <form action={setActive}>
                    <input type="hidden" name="id" value={u.id} />
                    <input type="hidden" name="active" value={u.active ? 'false' : 'true'} />
                    <button
                      type="submit"
                      className="rounded border border-neutral-300 dark:border-neutral-700 px-2 py-1 text-xs"
                    >
                      {u.active ? '停用' : '啟用'}
                    </button>
                  </form>
                  <form action={resetPin}>
                    <input type="hidden" name="id" value={u.id} />
                    <input
                      name="pin"
                      placeholder="新 PIN(4位數字)"
                      inputMode="numeric"
                      pattern="[0-9]{4}"
                      maxLength={4}
                      className="w-28 rounded border border-neutral-300 dark:border-neutral-700 px-2 py-1 text-xs bg-transparent"
                      required
                    />
                    <button
                      type="submit"
                      className="ml-1 rounded border border-neutral-300 dark:border-neutral-700 px-2 py-1 text-xs"
                    >
                      重設
                    </button>
                  </form>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
