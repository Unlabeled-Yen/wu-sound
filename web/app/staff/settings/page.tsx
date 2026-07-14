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
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: 'var(--nm-text-primary)' }}>設定</h1>
        <p className="text-[13px] mt-1" style={{ color: 'var(--nm-text-muted)' }}>目前登入 · {session.name}</p>
      </div>

      <section className="nm-raised rounded-2xl p-4 space-y-3">
        <h2 className="text-[15px] font-semibold" style={{ color: 'var(--nm-text-primary)' }}>修改 PIN</h2>
        <form action={changeOwnPin} className="grid gap-3">
          <label className="grid gap-1">
            <span className="text-sm" style={{ color: 'var(--nm-text-secondary)' }}>目前 PIN</span>
            <input
              name="current_pin"
              inputMode="numeric"
              pattern="[0-9]{4}"
              maxLength={4}
              required
              className="nm-input w-40"
              autoComplete="off"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm" style={{ color: 'var(--nm-text-secondary)' }}>新 PIN(4 位數字)</span>
            <input
              name="new_pin"
              inputMode="numeric"
              pattern="[0-9]{4}"
              maxLength={4}
              required
              className="nm-input w-40"
              autoComplete="off"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm" style={{ color: 'var(--nm-text-secondary)' }}>再輸一次</span>
            <input
              name="new_pin_confirm"
              inputMode="numeric"
              pattern="[0-9]{4}"
              maxLength={4}
              required
              className="nm-input w-40"
              autoComplete="off"
            />
          </label>
          <div>
            <button type="submit" className="nm-btn-solid text-sm">
              儲存
            </button>
          </div>
        </form>
      </section>

      <section className="nm-raised rounded-2xl p-4 space-y-3">
        <h2 className="text-[15px] font-semibold" style={{ color: 'var(--nm-text-primary)' }}>帳號</h2>
        <form action="/api/auth/logout" method="post">
          <button type="submit" className="nm-btn text-sm">
            登出
          </button>
        </form>
      </section>

      <div className="pt-2 text-xs" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', color: 'var(--nm-text-muted)' }}>
        <Link href="/staff" className="hover:underline nm-focus">← 回主畫面</Link>
      </div>
    </div>
  );
}
