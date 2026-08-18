import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { BossShell } from '@/app/boss/_shell/BossShell';

export const dynamic = 'force-dynamic';

// 老闆/員工共用工具區。老闆掛在 BossShell 底下(桌機側欄常駐,跟其他 /boss/* 頁一致);
// 員工是純手機使用者、沒有側欄概念,維持原本的極簡「← 返回」頭。
//
// 桌機不設 max-width(16-acoustic-merged.md):/tools/ 底下現在只剩 /tools/acoustic
// 一個真的會渲染的路由(spl-calculator、array-designer 都已改純 redirect),它需要
// 撐滿 BossShell 側欄讓出的剩餘寬度,不能再被多夾一層 1040px——側欄本身(232px)
// 已經是唯一該保留的擠壓來源,側欄以外的空間都該讓給示意圖。原本這裡還有
// PageTabs 切換「SPL 計算器／陣列設計器」兩頁,併頁後只剩一個 pill 沒有意義,
// 一併拿掉(lib/nav.ts 的 ACOUSTIC_TABS 匯出也一起刪)。
export default async function ToolsLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const content = (
    <div className="relative z-[1] flex-1 flex flex-col min-h-full max-w-[640px] lg:max-w-none w-full mx-auto px-[22px] py-6 lg:px-0 lg:py-0">
      <main className="flex-1">{children}</main>
    </div>
  );

  if (session.role === 'boss') {
    return <BossShell>{content}</BossShell>;
  }

  return (
    <div className="relative z-[1] flex-1 flex flex-col min-h-full max-w-[640px] lg:max-w-[1040px] w-full mx-auto px-[22px] py-6">
      <div className="mb-4">
        <Link href="/staff/settings" className="text-[13px] hover:underline nm-focus" style={{ color: 'var(--nm-text-muted)' }}>
          ← 返回
        </Link>
      </div>
      <main className="flex-1">{children}</main>
    </div>
  );
}
