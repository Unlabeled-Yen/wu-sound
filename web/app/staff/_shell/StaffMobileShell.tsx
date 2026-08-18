import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';
import { StaffMobileTopBar } from '@/app/_shared/StaffMobileTopBar';

// 員工手機版原本的殼層,原封不動從 app/staff/layout.tsx 搬過來——
// 暫緩開發中不刪,見 lib/view-mode.ts 的 STAFF_MOBILE_ENABLED。
// 現在只有那個常數改回 true 時才會被掛上。
//
// 2026-08-18 Yen 定案:AI 助理聊天頁(/voice-lab-chat)是員工手機版首頁,
// 這裡不再是首頁——底部三分頁列拿掉,零用金/專案備忘/打卡收進
// StaffMobileTopBar 的抽屜選單,這支殼層現在只負責幫這三個子頁掛頂列。

export default async function StaffMobileShell({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) return null; // layout 已經做過登入檢查,這裡不會真的走到

  const sb = getSupabaseAdmin();
  const { count } = await sb
    .from('expenses')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', session.id)
    .eq('status', 'draft');
  const draftCount = count ?? 0;

  return (
    <div className="relative z-[1] flex-1 flex flex-col min-h-full">
      <StaffMobileTopBar draftCount={draftCount} />
      <main className="flex-1 px-[22px] pt-[18px] pb-8">{children}</main>
    </div>
  );
}
