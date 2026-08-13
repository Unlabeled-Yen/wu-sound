import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { ChatClient } from './_components/ChatClient';

export const dynamic = 'force-dynamic';

/**
 * voice-lab Lab 2 測試頁(spec §5)。
 * 刻意不掛進 staff/boss 導覽——這是驗證對話品質用的實驗頁,
 * 正式入口放哪是 Lab 4 才決定的事。
 */
export default async function VoiceLabChatPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <div className="relative z-[1] flex-1 flex flex-col min-h-screen max-w-[720px] w-full mx-auto px-[22px] py-6">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h1 className="text-[17px] font-medium" style={{ color: 'var(--nm-text-primary)' }}>
          語音實驗室 · 打字模式
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
        這是測試頁。對話只存在記憶體裡,重新部署或閒置太久就會清空。
        寫入的操作一律要按下確認才會真的進系統。
      </p>
      <ChatClient />
    </div>
  );
}
