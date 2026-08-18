import Link from 'next/link';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';
import { BrandMark } from '@/app/_shared/BrandLogo';

// 員工手機版原本的殼層,原封不動從 app/staff/layout.tsx 搬過來——
// 暫緩開發中不刪,見 lib/view-mode.ts 的 STAFF_MOBILE_ENABLED。
// 現在只有那個常數改回 true 時才會被掛上。

// 員工手機只做兩件事(＋打卡):零用金票據、專案管理備忘。
// 待確認清單(/staff/queue)不再獨立佔一格,併進「零用金」分頁——拍收據跟
// 確認收據本來就是同一件事的兩個步驟,見 CaptureQueueBadge。工作記錄
// (/staff/worklog)、設備(/staff/equipment)不在這次收攏範圍內,先從底部
// 分頁移除,路由本身沒刪,需要的話還是能直接連結進去。
type TabKey = 'capture' | 'memo' | 'clockin';

const TABS: { key: TabKey; href: string; label: string; icon: (active: boolean) => React.ReactNode }[] = [
  { key: 'capture', href: '/staff/capture', label: '零用金', icon: CameraIcon },
  { key: 'memo', href: '/staff/memo', label: '專案備忘', icon: LogIcon },
  { key: 'clockin', href: '/staff/clockin', label: '打卡', icon: ClockIcon },
];

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
      <header
        className="sticky top-0 z-30 px-[22px] pt-1.5 pb-4"
        style={{
          background: 'rgba(20,20,23,0.34)',
          WebkitBackdropFilter: 'blur(14px) saturate(1.15)',
          backdropFilter: 'blur(14px) saturate(1.15)',
          borderBottom: '1px solid rgba(255,255,255,0.10)',
        }}
      >
        <div className="flex items-center justify-between text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>
          {/* 不顯示姓名/角色:登入後權限已定,使用者不需要辨識自己是誰 */}
          <BrandMark size={17} className="opacity-85" />
          <Link href="/staff/settings" className="flex items-center gap-1.5 nm-focus" aria-label="設定">
            <GearIcon />
            設定
          </Link>
        </div>
      </header>

      <main className="flex-1 pb-28 px-[22px] pt-[18px]">{children}</main>

      <nav
        className="fixed bottom-0 inset-x-0 z-40 px-3 pt-2 grid grid-cols-5"
        style={{
          background: 'rgba(16,16,20,0.5)',
          WebkitBackdropFilter: 'blur(22px) saturate(1.2)',
          backdropFilter: 'blur(22px) saturate(1.2)',
          borderTop: '1px solid rgba(255,255,255,0.12)',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)',
        }}
      >
        {TABS.map((t) => {
          const badge = t.key === 'capture' ? draftCount : 0;
          return (
            <Link
              key={t.href}
              href={t.href}
              className="relative flex flex-col items-center justify-center gap-1 py-1.5 rounded-2xl text-[10.5px] tracking-wide"
              style={{ color: '#7d7e83' }}
              data-tab={t.key}
            >
              <span className="relative">
                {t.icon(false)}
                {badge > 0 ? (
                  <span
                    className="absolute -top-1.5 -right-3 min-w-[17px] h-[17px] px-1 rounded-full text-[10px] font-bold leading-[17px] text-center"
                    style={{ background: 'var(--nm-warning)', color: '#17171a' }}
                  >
                    {badge}
                  </span>
                ) : null}
              </span>
              <span>{t.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function GearIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9M4.6 9a1.7 1.7 0 0 0-.3-1.9" />
    </svg>
  );
}
function CameraIcon(active: boolean) {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke={active ? '#f0f0f2' : '#7d7e83'} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 4h-5L8 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-4z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}
function LogIcon(active: boolean) {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke={active ? '#f0f0f2' : '#7d7e83'} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h4" />
    </svg>
  );
}
function ClockIcon(active: boolean) {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke={active ? '#f0f0f2' : '#7d7e83'} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
