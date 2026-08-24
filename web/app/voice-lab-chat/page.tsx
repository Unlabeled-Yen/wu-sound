import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';
import { MobileTopBar } from '@/app/_shared/MobileTopBar';
import { ChatClient } from './_components/ChatClient';
import { RealtimeVoiceClient } from './_components/RealtimeVoiceClient';

export const dynamic = 'force-dynamic';

/**
 * voice-lab Lab 2 測試頁(spec §5),同時是 ⌘K(桌面)與手機首頁共用的
 * 同一個 AI 助理頁——「同一個 AI,入口不同而已」(2026-08-18 Yen 確認,
 * 見 voice-lab/README.md「定位」段落),不是各端各做一套邏輯。
 *
 * 2026-08-18 Yen 定案:這頁就是員工手機版首頁(仿 Claude 手機版排版),
 * 底部三分頁列拿掉,收進 StaffMobileTopBar 的抽屜——所以這裡的頂列要
 * 依裝置寬度切換兩種樣子:手機(員工)用抽屜選單,桌機(⌘K 進來,含老闆)
 * 維持原本的標題 + 返回連結。兩套頭都渲染,靠 lg: 斷點互斥顯示,不是
 * 用 JS 判斷裝置。
 *
 * ?voice=1(手機首頁帶這個參數)= 走 OpenAI Realtime 全雙工語音對答
 *   (RealtimeVoiceClient,logo tap 開始/結束通話),對應手機端「跟 AI
 *   對答」的互動順位(2026-08-24 Yen 定案)。
 * ?voice=0(桌面 ⌘K 或手機切成打字模式)= 走傳統文字聊天(ChatClient)。
 * 兩條路都掛同一個 propose→確認→寫入的硬化流程,只是引擎跟 UI 不同。
 */
export default async function VoiceLabChatPage({
  searchParams,
}: {
  searchParams: Promise<{ voice?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');
  const sp = await searchParams;
  const autoVoice = sp.voice === '1';

  let draftCount = 0;
  if (session.role === 'staff') {
    const sb = getSupabaseAdmin();
    const { count } = await sb
      .from('expenses')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', session.id)
      .eq('status', 'draft');
    draftCount = count ?? 0;
  }

  return (
    // overflow-hidden 是關鍵:沒有它的話,真機上鍵盤彈出/網址列收合那個瞬間,
    // 只要內容高度短暫超出一點點,溢出的部分會被 body(globals.css 只有
    // min-height:100dvh,沒有 overflow:hidden)接手變成整頁捲動——訊息串跟
    // 打字列會一起被推走,要滑到底才找得到打字列。加這個讓溢出永遠留在
    // 這支容器內部處理,不會漏到 body(2026-08-18 真機回報後修)。
    <div className="relative z-[1] flex-1 flex flex-col h-[100dvh] overflow-hidden lg:h-auto lg:min-h-screen lg:overflow-visible">
      <div className="lg:hidden">
        <MobileTopBar role={session.role} draftCount={draftCount} />
      </div>

      <div className="hidden lg:flex items-baseline justify-between gap-3 max-w-[720px] w-full mx-auto px-[22px] pt-6">
        <h1 className="text-[17px] font-medium" style={{ color: 'var(--nm-text-primary)' }}>
          語音實驗室 · {autoVoice ? '語音對答' : '打字模式'}
        </h1>
        <Link
          href={session.role === 'boss' ? '/boss' : '/staff'}
          className="text-[13px] hover:underline nm-focus"
          style={{ color: 'var(--nm-text-muted)' }}
        >
          ← 返回
        </Link>
      </div>

      {/* 手機語音入口(?voice=1)= Realtime 全雙工;其餘走 ChatClient 打字。
          兩種模式互不共用引擎,但兩邊都有一個回頭切換的入口:語音模式底下
          給一個「改打字」按鈕,打字模式的 logo tap 會開語音——見對應元件。 */}
      {autoVoice ? (
        <>
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
        </>
      ) : (
        <ChatClient autoVoice={false} />
      )}
    </div>
  );
}
