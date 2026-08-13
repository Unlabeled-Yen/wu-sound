import Link from 'next/link';
import { LineBindCard } from '@/app/_shared/LineBindCard';

export const dynamic = 'force-dynamic';

type Item = { href: string; label: string };
type Group = { title: string; items: Item[] };

const GROUPS: Group[] = [
  {
    title: '財務',
    items: [
      { href: '/boss/close', label: '薪資結算' },
      { href: '/boss/ledger', label: '帳務管理' },
    ],
  },
  {
    title: '報價系統',
    items: [
      { href: '/boss/bundles', label: '標配套組' },
      { href: '/boss/catalog', label: '價目表' },
    ],
  },
  {
    title: '設備庫存',
    items: [{ href: '/boss/equipment', label: '設備庫存' }],
  },
  {
    title: '專案管理',
    items: [{ href: '/boss/sites', label: '專案管理' }],
  },
  {
    title: '現場',
    items: [{ href: '/boss/clockins', label: '打卡' }],
  },
  {
    title: '標案',
    items: [
      { href: '/boss/tenders', label: '資料進度板' },
      { href: '/boss/tenders/monitor', label: '標案監測' },
    ],
  },
  {
    title: '聲學計算',
    items: [
      { href: '/tools/spl-calculator', label: 'SPL 預算計算器' },
      { href: '/tools/array-designer', label: '陣列設計器' },
    ],
  },
  {
    title: '設定',
    items: [{ href: '/boss/users', label: '使用者管理' }],
  },
];

export default function BossMorePage() {
  return (
    <div className="flex flex-col gap-6 max-w-[560px]">
      {GROUPS.map((g) => (
        <section key={g.title} className="flex flex-col gap-2">
          <div
            className="text-[10.5px] uppercase tracking-[0.18em] px-1"
            style={{ color: 'var(--nm-text-faint)' }}
          >
            {g.title}
          </div>
          <ul className="flex flex-col gap-2">
            {g.items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex items-center justify-between rounded-2xl nm-raised px-5 py-4 nm-focus"
                  style={{ color: 'var(--nm-text-body)' }}
                >
                  <span className="text-[15px] font-medium">{item.label}</span>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--nm-text-muted)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="m9 6 6 6-6 6" />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <LineBindCard />

      <section className="flex flex-col gap-2 pt-2">
        <div
          className="text-[10.5px] uppercase tracking-[0.18em] px-1"
          style={{ color: 'var(--nm-text-faint)' }}
        >
          登入
        </div>
        <form action="/api/auth/logout" method="post">
          <button
            type="submit"
            className="w-full flex items-center justify-between rounded-2xl nm-raised px-5 py-4 nm-focus"
            style={{ color: 'var(--nm-danger-glass-text)' }}
          >
            <span className="text-[15px] font-medium">登出</span>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5" />
              <path d="M21 12H9" />
            </svg>
          </button>
        </form>
      </section>
    </div>
  );
}
