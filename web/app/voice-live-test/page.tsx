import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { LiveTest } from './_components/LiveTest';

export const dynamic = 'force-dynamic';

/**
 * AI 助理入口——獨立分頁,不是浮動覆蓋層(Yen 2026-08-15 定案的形狀)。
 * 規格:voice-lab/lab3c-realtime-spec-v1.md;快捷鍵設計見 useAssistantShortcut.ts。
 *
 * 在 ERP 任一頁按 ⌘K 跳來這裡;這頁按 ⌘K 跳回剛才那一頁。
 * 「查看數據」是一般 <Link>,不是這頁的職責去讀資料——助理只負責對話與寫入確認,
 * 看數字進對應的 ERP 頁面,職責不混在一起。
 */
const QUICK_LINKS = [
  { href: '/boss/ledger', label: '帳務管理' },
  { href: '/boss/quotes', label: '報價系統' },
  { href: '/boss/sites', label: '專案管理' },
  { href: '/boss/worklogs', label: '工作記錄' },
  { href: '/boss/equipment', label: '設備庫存' },
];

export default async function VoiceLiveTestPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <div className="relative z-[1] flex-1 flex flex-col min-h-screen max-w-[720px] w-full mx-auto px-[22px] py-6">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h1 className="text-[17px] font-medium" style={{ color: 'var(--nm-text-primary)' }}>
          AI 助理
        </h1>
        <div className="flex items-center gap-3">
          <span className="text-[11px] nm-pill px-2 py-1" style={{ color: 'var(--nm-text-faint)' }}>
            ⌘K 回上一頁
          </span>
          <Link href="/voice-lab-chat" className="text-[13px] hover:underline nm-focus" style={{ color: 'var(--nm-text-muted)' }}>
            打字模式
          </Link>
        </div>
      </div>
      <p className="mb-4 text-[12px] leading-relaxed" style={{ color: 'var(--nm-text-faint)' }}>
        跟它說話記工作記錄、開任務。寫入一律先出現確認卡片,你明確確認才會真的進系統。
      </p>

      <LiveTest />

      <div className="mt-5">
        <p className="mb-2 text-[11px]" style={{ color: 'var(--nm-text-faint)' }}>
          查看數據
        </p>
        <div className="flex flex-wrap gap-2">
          {QUICK_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="nm-btn text-[13px] nm-focus">
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
