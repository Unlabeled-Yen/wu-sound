import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { createUser } from '../actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function NewUserPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'boss') redirect('/staff');

  return (
    <div className="max-w-md">
      <div className="flex items-baseline gap-2 mb-4">
        <Link href="/boss/users" className="text-sm text-neutral-500 hover:underline">
          ← 使用者管理
        </Link>
      </div>
      <h1 className="text-xl font-semibold mb-4">新增使用者</h1>
      <form action={createUser} className="grid gap-4">
        <label className="grid gap-1">
          <span className="text-sm">姓名</span>
          <input
            name="name"
            required
            className="rounded border border-neutral-300 dark:border-neutral-700 px-3 py-2 bg-transparent"
          />
        </label>
        <fieldset className="grid gap-1">
          <legend className="text-sm">角色</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="role" value="staff" defaultChecked /> 員工
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="role" value="boss" /> 老闆
          </label>
        </fieldset>
        <label className="grid gap-1">
          <span className="text-sm">初始 PIN(4 位數字)</span>
          <input
            name="pin"
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
            required
            className="w-32 rounded border border-neutral-300 dark:border-neutral-700 px-3 py-2 bg-transparent"
          />
          <span className="text-xs text-neutral-500">建議上線後請本人自行修改</span>
        </label>
        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            className="rounded bg-neutral-900 dark:bg-white text-white dark:text-black px-4 py-2 text-sm"
          >
            建立
          </button>
          <Link
            href="/boss/users"
            className="rounded border border-neutral-300 dark:border-neutral-700 px-4 py-2 text-sm"
          >
            取消
          </Link>
        </div>
      </form>
    </div>
  );
}
