import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';
import { BrandMark } from '@/app/_shared/BrandLogo';

export const dynamic = 'force-dynamic';

type TabKey = 'capture' | 'queue' | 'worklog' | 'equipment' | 'clockin';

const TABS: { key: TabKey; href: string; label: string; icon: (active: boolean) => React.ReactNode }[] = [
  { key: 'capture', href: '/staff/capture', label: '相機', icon: CameraIcon },
  { key: 'queue', href: '/staff/queue', label: '待確認', icon: InboxIcon },
  { key: 'worklog', href: '/staff/worklog', label: '工作記錄', icon: LogIcon },
  { key: 'equipment', href: '/staff/equipment', label: '設備', icon: BoxIcon },
  { key: 'clockin', href: '/staff/clockin', label: '打卡', icon: ClockIcon },
];

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'staff') redirect('/boss');

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
          <span className="flex items-center gap-2">
            <BrandMark size={17} className="opacity-85" />
            {session.name} · 技師
          </span>
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
          const badge = t.key === 'queue' ? draftCount : 0;
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
function InboxIcon(active: boolean) {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke={active ? '#f0f0f2' : '#7d7e83'} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.5 6.5 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-5.5A2 2 0 0 0 16.8 5.5H7.2a2 2 0 0 0-1.7 1z" />
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
function BoxIcon(active: boolean) {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke={active ? '#f0f0f2' : '#7d7e83'} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 8 12 3 3 8v8l9 5 9-5V8z" />
      <path d="M3 8l9 5 9-5" />
      <path d="M12 13v8" />
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
