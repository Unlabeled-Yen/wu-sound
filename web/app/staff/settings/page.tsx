import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { changeOwnPin } from './actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function StaffSettingsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <div className="max-w-md p-4">
      <h1 className="text-xl font-semibold mb-1">設定</h1>
      <p className="text-sm text-neutral-500 mb-6">目前登入 · {session.name}</p>

      <section className="mb-8">
        <h2 className="text-base font-medium mb-3">修改 PIN</h2>
        <form action={changeOwnPin} className="grid gap-3">
          <label className="grid gap-1">
            <span className="text-sm">目前 PIN</span>
            <input
              name="current_pin"
              inputMode="numeric"
              pattern="[0-9]{4}"
              maxLength={4}
              required
              className="w-40 rounded border border-neutral-300 dark:border-neutral-700 px-3 py-2 bg-transparent"
              autoComplete="off"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm">新 PIN(4 位數字)</span>
            <input
              name="new_pin"
              inputMode="numeric"
              pattern="[0-9]{4}"
              maxLength={4}
              required
              className="w-40 rounded border border-neutral-300 dark:border-neutral-700 px-3 py-2 bg-transparent"
              autoComplete="off"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm">再輸一次</span>
            <input
              name="new_pin_confirm"
              inputMode="numeric"
              pattern="[0-9]{4}"
              maxLength={4}
              required
              className="w-40 rounded border border-neutral-300 dark:border-neutral-700 px-3 py-2 bg-transparent"
              autoComplete="off"
            />
          </label>
          <div>
            <button
              type="submit"
              className="rounded bg-neutral-900 dark:bg-white text-white dark:text-black px-4 py-2 text-sm"
            >
              儲存
            </button>
          </div>
        </form>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-medium mb-3">帳號</h2>
        <form action="/api/auth/logout" method="post">
          <button
            type="submit"
            className="rounded border border-neutral-300 dark:border-neutral-700 px-4 py-2 text-sm"
          >
            登出
          </button>
        </form>
      </section>

      <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800 text-xs text-neutral-500">
        <Link href="/staff" className="hover:underline">← 回主畫面</Link>
      </div>
    </div>
  );
}
