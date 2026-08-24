import Link from 'next/link';
import { getSession } from '@/lib/session';
import { RealtimeVoiceClient } from '@/app/voice-lab-chat/_components/RealtimeVoiceClient';

// 總覽 v2(13a)桌機版重新規劃暫緩(2026-08-15 Yen 決定)——桌機先放「即將推出」
// 占位畫面。OverviewDesktop.tsx / lib/overview-data.ts 兩支既有實作保留在
// 專案裡但不掛上這個頁面,之後真的要重新規劃時可能還用得上,不要刪掉。
//
// 2026-08-18 Yen 定案:老闆手機版首頁換成跟員工同一套 AI 介面(取代原本
// 的財務儀表板 BossMobileDashboard)。原本儀表板的數字收進抽屜「總覽(金流
// 摘要)」項目(見 /boss/overview),不是整個拿掉——只是不再是一進來就看到
// 的畫面。桌機版不受影響,還是占位卡。
//
// 2026-08-24 Yen 定案:跟員工一致,老闆手機首頁也走 Realtime 語音對答
// (RealtimeVoiceClient),不是原本的 ChatClient 打字介面。要打字的話點
// 畫面下方「改用打字」切到 /voice-lab-chat。

export const dynamic = 'force-dynamic';

function ComingSoonCard({ subtitle }: { subtitle: string }) {
  return (
    <div className="flex items-center justify-center" style={{ minHeight: '60vh' }}>
      <div
        className="rounded-2xl px-10 py-8 text-center"
        style={{ border: '1px solid rgba(255,255,255,.09)', background: 'rgba(8,8,10,.4)' }}
      >
        <div className="text-[15px] font-medium mb-2" style={{ color: 'var(--nm-text-primary)' }}>總覽即將推出</div>
        <div className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>{subtitle}</div>
      </div>
    </div>
  );
}

export default async function BossDashboard() {
  const session = await getSession();

  // 桌機版兩個角色都還是占位卡(13a 重新規劃暫緩)。手機版:老闆是 AI 聊天
  // 首頁,員工在手機寬度下是占位卡(員工手機版首頁另有 /staff → /voice-lab-chat)。
  if (session?.role !== 'boss') {
    return (
      <>
        <div className="lg:hidden"><ComingSoonCard subtitle="手機版總覽正在重新規劃中" /></div>
        <div className="hidden lg:block"><ComingSoonCard subtitle="桌機版總覽正在重新規劃中" /></div>
      </>
    );
  }

  return (
    <>
      {/* Mobile-only:AI 語音對答首頁(跟員工同一支元件,見 BossShell.tsx 的 isBossChatHome) */}
      <div className="lg:hidden flex-1 min-h-0 flex flex-col">
        <RealtimeVoiceClient />
        <div className="flex justify-center pb-6">
          <Link
            href="/voice-lab-chat"
            className="text-[12px] px-3 py-1.5 rounded-lg nm-focus"
            style={{ color: 'var(--nm-text-muted)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            改用打字
          </Link>
        </div>
      </div>

      {/* Desktop view — 總覽重新規劃暫緩,先放占位畫面 */}
      <div className="hidden lg:block"><ComingSoonCard subtitle="桌機版總覽正在重新規劃中" /></div>
    </>
  );
}
