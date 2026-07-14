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
          <h1 className="text-xl font-semibold" style={{ color: 'var(--nm-text-primary)' }}>使用者管理</h1>
          <p className="text-[13px] mt-0.5" style={{ color: 'var(--nm-text-secondary)' }}>共 {users.length} 人。停用後該帳號無法登入,但歷史紀錄保留。</p>
        </div>
        <Link
          href="/boss/users/new"
          className="nm-btn-solid text-[13px]"
        >
          新增使用者
        </Link>
      </div>

      {error ? (
        <div
          className="rounded-xl p-3 text-[13px] mb-4"
          style={{
            background: 'rgba(224, 122, 122, 0.08)',
            border: '1px solid rgba(224, 122, 122, 0.34)',
            color: 'var(--nm-danger-glass-text)',
          }}
        >
          讀取失敗:{error.message}
        </div>
      ) : null}

      <div className="rounded-2xl nm-raised overflow-x-auto overflow-y-auto">
        <table className="w-full text-[13px]" style={{ minWidth: 780, borderCollapse: 'collapse' }}>
          <thead style={{ background: 'rgba(20,20,24,0.92)' }}>
            <tr style={{ color: 'var(--nm-text-muted)' }}>
              <th className="text-left py-2.5 px-3.5 font-normal text-xs whitespace-nowrap">姓名</th>
              <th className="text-left py-2.5 px-3.5 font-normal text-xs whitespace-nowrap">角色</th>
              <th className="text-left py-2.5 px-3.5 font-normal text-xs whitespace-nowrap">狀態</th>
              <th className="text-left py-2.5 px-3.5 font-normal text-xs whitespace-nowrap">建立時間</th>
              <th className="text-left py-2.5 px-3.5 font-normal text-xs whitespace-nowrap">動作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ borderTop: '1px solid var(--nm-border-hair)' }}>
                <td className="py-2 px-3.5 whitespace-nowrap">
                  <form action={updateName} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={u.id} />
                    <input
                      name="name"
                      defaultValue={u.name}
                      className="border-b outline-none bg-transparent nm-focus"
                      style={{ borderColor: 'transparent', color: 'var(--nm-text-body)' }}
                    />
                    <button
                      type="submit"
                      className="text-xs nm-focus"
                      style={{ color: 'var(--nm-text-muted)' }}
                    >
                      存
                    </button>
                  </form>
                </td>
                <td className="py-2 px-3.5 whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>{ROLE_LABEL[u.role]}</td>
                <td className="py-2 px-3.5 whitespace-nowrap">
                  {u.active ? (
                    <span className="nm-pill" style={{ color: 'var(--nm-success-glass-text)', background: 'rgba(126,207,157,0.08)', borderColor: 'rgba(126,207,157,0.26)' }}>啟用中</span>
                  ) : (
                    <span className="nm-pill nm-pill-muted line-through">已停用</span>
                  )}
                </td>
                <td className="py-2 px-3.5 text-xs whitespace-nowrap" style={{ color: 'var(--nm-text-muted)' }}>
                  {new Date(u.created_at).toLocaleDateString('zh-TW')}
                </td>
                <td className="py-2 px-3.5 whitespace-nowrap">
                  <div className="flex flex-wrap gap-2">
                    <form action={setActive}>
                      <input type="hidden" name="id" value={u.id} />
                      <input type="hidden" name="active" value={u.active ? 'false' : 'true'} />
                      <button
                        type="submit"
                        className="nm-btn text-xs"
                        style={{ padding: '4px 10px', minHeight: 'auto' }}
                      >
                        {u.active ? '停用' : '啟用'}
                      </button>
                    </form>
                    <form action={resetPin} className="flex gap-1">
                      <input type="hidden" name="id" value={u.id} />
                      <input
                        name="pin"
                        placeholder="新 PIN(4位數字)"
                        inputMode="numeric"
                        pattern="[0-9]{4}"
                        maxLength={4}
                        className="nm-input text-xs"
                        style={{ width: 112, minHeight: 'auto', padding: '4px 8px' }}
                        required
                      />
                      <button
                        type="submit"
                        className="nm-btn text-xs"
                        style={{ padding: '4px 10px', minHeight: 'auto' }}
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
    </div>
  );
}
