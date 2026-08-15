'use client';

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import type { UserRole } from '@/lib/types';
import { BrandLockup } from '@/app/_shared/BrandLogo';
import {
  ChannelStrip,
  ConnDot,
  Keypad,
  LevelMeter,
  MeterScale,
  Ruler,
  Screw,
  SignalPath,
  formatClock,
  mono,
  pad2,
  sans,
} from './_login-visuals';
import type { ActiveUser } from './_login-visuals';

interface Props {
  users: ActiveUser[];
}

const NETWORK_ERROR_MESSAGE = '網路連線失敗,請稍後再試';

// --- Main component: state / logic below is unchanged from the pre-redesign version ---

export default function LoginForm({ users }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<ActiveUser | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Decorative-only state: connection dot + clock. Does not touch login logic.
  const [online, setOnline] = useState(true);
  const [now, setNow] = useState<Date | null>(null);

  // Which layout tree to mount. Only one of desktop/mobile is ever rendered
  // (rather than both + CSS hide) so verification queries like
  // document.querySelectorAll('[data-meter-seg]') see exactly 12 segments,
  // not 24, and there's no duplicate focusable/interactive markup.
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);

  useEffect(() => {
    setOnline(navigator.onLine);
    setNow(new Date());
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    const clockId = setInterval(() => setNow(new Date()), 30_000);

    const mq = window.matchMedia('(min-width: 768px)');
    setIsDesktop(mq.matches);
    const onMqChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', onMqChange);

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      clearInterval(clockId);
      mq.removeEventListener('change', onMqChange);
    };
  }, []);

  async function tryLogin(fullPin: string, user: ActiveUser) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: user.name, pin: fullPin }),
      });
      if (res.status === 401) {
        setError('PIN 錯誤,請重試');
        setPin('');
        setSubmitting(false);
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error || '登入失敗,請稍後再試');
        setPin('');
        setSubmitting(false);
        return;
      }
      const body = (await res.json()) as { ok: boolean; role: UserRole };
      router.replace(body.role === 'boss' ? '/boss' : '/staff');
      router.refresh();
    } catch {
      setError(NETWORK_ERROR_MESSAGE);
      setPin('');
      setSubmitting(false);
    }
  }

  function handleDigit(d: string) {
    if (!selected || submitting) return;
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    setError(null);
    if (next.length === 4) {
      void tryLogin(next, selected);
    }
  }

  function handleBackspace() {
    if (submitting) return;
    setPin((p) => p.slice(0, -1));
    setError(null);
  }

  function handleSwitchUser() {
    setSelected(null);
    setPin('');
    setError(null);
  }

  // Physical-keyboard support (desktop): wires digit keys / backspace to the
  // exact same handlers used by the on-screen keys above — no new logic.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!selected) return;
      if (/^[0-9]$/.test(e.key)) {
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        handleBackspace();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, pin, submitting]);

  const networkDown = error === NETWORK_ERROR_MESSAGE;
  const connOk = online && !networkDown;
  const chNumber = selected ? pad2(users.findIndex((u) => u.id === selected.id) + 1) : '';
  const sectionLabel: CSSProperties = { ...sans(10.5, '#6d6e73', { ls: '.18em' }), textTransform: 'uppercase' };
  const sectionLabelMobile: CSSProperties = { ...sectionLabel, marginBottom: 12 };

  // Only one layout tree is mounted at a time (see isDesktop effect above).
  // Render nothing for the one frame before the viewport check resolves.
  if (isDesktop === null) {
    return null;
  }

  if (isDesktop) {
    return (
      <div style={{ width: 960, maxWidth: '100%' }}>
        <div className="nm-raised-lg" style={{ borderRadius: 20, overflow: 'hidden' }}>
          <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--nm-border-hair)', display: 'flex', alignItems: 'center', gap: 18 }}>
            <Screw />
            <BrandLockup width={126} />
            <span style={{ flex: 1 }} />
            <span style={mono(10.5, '#6d6e73', { ls: '.14em' })}>聲生工作系統</span>
            <span aria-hidden style={{ width: 1, height: 12, background: 'rgba(255,255,255,.12)', display: 'block' }} />
            <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <ConnDot ok={connOk} />
              <span style={mono(10.5, '#6d6e73')}>{connOk ? '連線正常' : '連線中斷'}</span>
            </span>
            {now ? <span style={mono(10.5, '#5a5b60')}>{formatClock(now)}</span> : <span />}
            <Screw />
          </div>

          <div style={{ padding: '18px 42px 16px', borderBottom: '1px solid var(--nm-border-hair)', background: 'rgba(8,8,10,.24)' }}>
            <SignalPath step={selected ? 1 : 0} />
          </div>

          <div style={{ display: 'flex', minHeight: 430 }}>
            <div style={{ width: 430, flex: 'none', borderRight: '1px solid rgba(255,255,255,.07)', padding: '22px 24px 22px 0', display: 'flex', gap: 14 }}>
              <Ruler />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...sectionLabel, marginBottom: 14 }}>選擇你的名字</div>
                {users.length === 0 ? (
                  <p style={sans(13, 'var(--nm-text-secondary)', { lh: 1.6 })}>尚無啟用中的使用者</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {users.map((u, i) => (
                      <ChannelStrip
                        key={u.id}
                        index={i}
                        user={u}
                        selected={selected?.id === u.id}
                        onSelect={() => setSelected(u)}
                        minHeight={58}
                        numberWidth={34}
                        nameSize={15.5}
                        roleSize={11}
                      />
                    ))}
                  </div>
                )}
                <div style={sans(11.5, '#5a5b60', { lh: 1.7 })} className="mt-4">
                  名字在這裡＝帳號已啟用。找不到自己＝還沒建，請找老闆。
                </div>
              </div>
            </div>

            <div style={{ flex: 1, minWidth: 0, padding: '22px 26px 24px', display: 'flex', flexDirection: 'column' }}>
              {selected ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
                    <span style={sectionLabel}>輸入 4 位 PIN</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={sans(14, '#f0f0f2', { weight: 500 })}>{selected.name}</span>
                      <span style={mono(11, '#6d6e73')}>CH {chNumber}</span>
                    </span>
                  </div>
                  <LevelMeter pinLength={pin.length} submitting={submitting} error={!!error} height={34} />
                  <MeterScale marginBottom={26} />
                  <Keypad
                    submitting={submitting}
                    pinLength={pin.length}
                    onDigit={handleDigit}
                    onBackspace={handleBackspace}
                    onSwitchUser={handleSwitchUser}
                    minHeight={60}
                    fontSize={22}
                    gap={10}
                    iconSize={20}
                    showSwitchUser
                  />
                  <div
                    role={error ? 'alert' : undefined}
                    style={{ marginTop: 'auto', paddingTop: 16, ...(error ? sans(12.5, 'var(--nm-danger-glass-text)', { lh: 1.6 }) : sans(11.5, '#5a5b60', { lh: 1.7 })) }}
                  >
                    {error ?? '第四位輸入完，電平頂到 0 dB 自動送出。也可以直接用鍵盤打。'}
                  </div>
                </>
              ) : (
                <div style={{ margin: 'auto', textAlign: 'center', ...sans(12.5, '#5a5b60', { lh: 1.6 }) }}>從左側選擇你的名字以輸入 PIN</div>
              )}
            </div>
          </div>

          <div style={{ padding: '12px 22px', borderTop: '1px solid var(--nm-border-hair)', background: 'rgba(8,8,10,.24)', display: 'flex', alignItems: 'center', gap: 18 }}>
            <Screw />
            <span style={{ flex: 1, ...mono(10, '#5a5b60', { ls: '.12em' }) }}>WU-SOUND　內部系統　·　僅供在職人員使用</span>
            <span style={mono(10, '#5a5b60')}>v2.4.1</span>
            <Screw />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[390px] mx-auto flex flex-col" style={{ padding: '8px 4px 24px' }}>
      {!selected ? (
          <>
            <div style={{ margin: '16px 0 8px', display: 'flex', justifyContent: 'center' }}>
              <BrandLockup width={168} />
            </div>
            <div style={{ textAlign: 'center', marginBottom: 26, ...sans(12.5, '#9c9293') }}>聲生工作系統</div>
            <div style={{ marginBottom: 26 }}>
              <SignalPath step={0} compact />
            </div>
            <div style={sectionLabelMobile}>選擇你的名字</div>
            {users.length === 0 ? (
              <p style={sans(13, 'var(--nm-text-secondary)', { lh: 1.6 })}>尚無啟用中的使用者</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {users.map((u, i) => (
                  <ChannelStrip
                    key={u.id}
                    index={i}
                    user={u}
                    selected={false}
                    onSelect={() => setSelected(u)}
                    minHeight={66}
                    numberWidth={36}
                    nameSize={17}
                    roleSize={11.5}
                    extraShadow
                  />
                ))}
              </div>
            )}
            <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
              <ConnDot ok={connOk} />
              <span style={mono(10.5, '#5a5b60')}>{connOk ? '連線正常' : '連線中斷'}</span>
              <span style={{ marginLeft: 'auto', ...mono(10.5, '#5a5b60') }}>v2.4.1</span>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '4px 0 22px' }}>
              <button
                type="button"
                onClick={handleSwitchUser}
                className="nm-focus"
                style={{ minHeight: 44, display: 'flex', alignItems: 'center', background: 'none', border: 'none', padding: 0, ...sans(13.5, '#9c9293') }}
              >
                ← 換人
              </button>
              <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={sans(15, '#f0f0f2', { weight: 500 })}>{selected.name}</span>
                <span style={mono(10.5, '#6d6e73')}>CH {chNumber}</span>
              </span>
            </div>
            <div style={{ marginBottom: 26 }}>
              <SignalPath step={1} compact />
            </div>
            <div style={sectionLabelMobile}>輸入 4 位 PIN</div>
            <LevelMeter pinLength={pin.length} submitting={submitting} error={!!error} height={40} />
            <MeterScale marginBottom={24} />
            <Keypad
              submitting={submitting}
              pinLength={pin.length}
              onDigit={handleDigit}
              onBackspace={handleBackspace}
              onSwitchUser={handleSwitchUser}
              minHeight={68}
              fontSize={26}
              gap={11}
              iconSize={22}
              showSwitchUser={false}
            />
            {error ? (
              <p role="alert" style={{ marginTop: 14, ...sans(12.5, 'var(--nm-danger-glass-text)', { lh: 1.6 }) }}>
                {error}
              </p>
            ) : null}
            <div style={{ marginTop: 'auto', paddingTop: 18, display: 'flex', alignItems: 'center', gap: 10 }}>
              <ConnDot ok={connOk} />
              <span style={mono(10.5, '#5a5b60')}>{connOk ? '連線正常' : '連線中斷'}</span>
              <span style={{ marginLeft: 'auto', ...mono(10.5, '#5a5b60') }}>v2.4.1</span>
            </div>
          </>
        )}
      </div>
    );
}
