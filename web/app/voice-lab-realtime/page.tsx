import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { RealtimeClient } from './RealtimeClient';

export const dynamic = 'force-dynamic';

/**
 * voice-lab Realtime 測試頁——跟 voice-lab-chat(Lab 2 打字版)同一套「刻意不掛進
 * staff/boss 導覽」的做法,這是驗證全雙工語音品質用的實驗頁,正式入口放哪還沒決定。
 * 用 OpenAI Realtime API(WebRTC)取代 Lab 2 的「錄音→轉文字→Claude/Kimi agent」
 * 批次流程,語音直接對話、直接呼叫工具。
 */
export default async function VoiceLabRealtimePage() {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <div className="relative z-[1] flex-1 flex flex-col min-h-screen max-w-[720px] w-full mx-auto px-[22px] py-6">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h1 className="text-[17px] font-medium" style={{ color: 'var(--nm-text-primary)' }}>
          語音實驗室 · 即時語音模式
        </h1>
        <Link
          href={session.role === 'boss' ? '/boss' : '/staff'}
          className="text-[13px] hover:underline nm-focus"
          style={{ color: 'var(--nm-text-muted)' }}
        >
          ← 返回
        </Link>
      </div>
      <p className="mb-4 text-[12px] leading-relaxed" style={{ color: 'var(--nm-text-faint)' }}>
        這是測試頁。開始通話後直接開口講話就好,AI 提案「要不要記…」之後,
        清楚講「對」「確認」或「好」才會真的寫入——系統只認這幾個詞,
        不會自己判斷「聽起來像同意」。講「取消」或「不對」可以撤銷提案。
      </p>
      <RealtimeClient />
    </div>
  );
}
