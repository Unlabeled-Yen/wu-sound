import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { LiveTest } from './_components/LiveTest';

export const dynamic = 'force-dynamic';

/**
 * Lab 3c 最小可行性驗證頁(spec §0):純粹驗「連得上、講得順」,不含工具。
 * 不掛導覽;驗證通過才進入工具整合階段。
 */
export default async function VoiceLiveTestPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <div className="relative z-[1] flex-1 flex flex-col min-h-screen max-w-[720px] w-full mx-auto px-[22px] py-6">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h1 className="text-[17px] font-medium" style={{ color: 'var(--nm-text-primary)' }}>
          即時語音 · 可行性測試
        </h1>
        <Link href="/voice-lab-chat" className="text-[13px] hover:underline nm-focus" style={{ color: 'var(--nm-text-muted)' }}>
          ← 回打字模式
        </Link>
      </div>
      <p className="mb-4 text-[12px] leading-relaxed" style={{ color: 'var(--nm-text-faint)' }}>
        這一頁只驗證「即時對話流不流暢」:連線後直接開口講話,它會用真人聲音回,講到一半可以插話。
        沒有接任何系統工具——它現在記不了工作記錄,純聊天測延遲與辨識品質。
      </p>
      <LiveTest />
    </div>
  );
}
