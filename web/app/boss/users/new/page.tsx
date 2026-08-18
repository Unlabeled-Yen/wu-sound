import Link from 'next/link';
import { requirePageCapability } from '@/lib/require-capability';
import { createUser } from '../actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function NewUserPage() {
  await requirePageCapability('user-admin');

  return (
    <div className="max-w-md">
      <div className="flex items-baseline gap-2 mb-4">
        <Link href="/boss/users" className="text-[13px] hover:underline" style={{ color: 'var(--nm-text-muted)' }}>
          ← 使用者管理
        </Link>
      </div>
      <h1 className="text-xl font-semibold mb-4" style={{ color: 'var(--nm-text-primary)' }}>新增使用者</h1>
      <form action={createUser} className="grid gap-4">
        <label className="grid gap-1">
          <span className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>姓名</span>
          <input
            name="name"
            required
            className="nm-input"
          />
        </label>
        <fieldset className="grid gap-1">
          <legend className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>角色</legend>
          <label className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--nm-text-body)' }}>
            <input type="radio" name="role" value="staff" defaultChecked /> 員工
          </label>
          <label className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--nm-text-body)' }}>
            <input type="radio" name="role" value="boss" /> 老闆
          </label>
        </fieldset>
        <label className="grid gap-1">
          <span className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>初始 PIN(4 位數字)</span>
          <input
            name="pin"
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
            required
            className="w-32 nm-input"
          />
          <span className="text-xs" style={{ color: 'var(--nm-text-muted)' }}>建議上線後請本人自行修改</span>
        </label>
        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            className="nm-btn-solid text-[13px]"
          >
            建立
          </button>
          <Link
            href="/boss/users"
            className="nm-btn text-[13px]"
          >
            取消
          </Link>
        </div>
      </form>
    </div>
  );
}
