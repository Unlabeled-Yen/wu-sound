// Pure presentational pieces for the login page (channel-strip / level-meter /
// signal-path visual language). No state, no login logic — see LoginForm.tsx.
import type { CSSProperties } from 'react';
import type { UserRole } from '@/lib/types';

export interface ActiveUser {
  id: string;
  name: string;
  role: UserRole;
}

export const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';
export const SANS = "'Noto Sans TC', 'PingFang TC', sans-serif";

export function mono(size: number, color: string, opts: { weight?: number; ls?: string; lh?: number } = {}): CSSProperties {
  return { fontFamily: MONO, fontSize: size, fontWeight: opts.weight ?? 400, lineHeight: opts.lh ?? 1, letterSpacing: opts.ls, color };
}
export function sans(size: number, color: string, opts: { weight?: number; ls?: string; lh?: number } = {}): CSSProperties {
  return { fontFamily: SANS, fontSize: size, fontWeight: opts.weight ?? 400, lineHeight: opts.lh ?? 1, letterSpacing: opts.ls, color };
}
export function pad2(n: number) {
  return String(n).padStart(2, '0');
}
export function formatClock(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function Screw() {
  return (
    <span
      aria-hidden
      style={{
        flex: 'none',
        display: 'block',
        width: 7,
        height: 7,
        borderRadius: 999,
        background: 'rgba(8,8,10,.6)',
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,.9), 0 1px 0 rgba(255,255,255,.08)',
      }}
    />
  );
}

export function Ruler() {
  return (
    <div style={{ flex: 'none', width: 26, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '6px 0' }}>
      {Array.from({ length: 10 }).map((_, i) => {
        const long = i % 3 === 0;
        return (
          <span
            key={i}
            aria-hidden
            style={{
              display: 'block',
              height: 1,
              width: long ? 18 : 10,
              marginLeft: long ? 8 : 16,
              background: long ? 'rgba(255,255,255,.22)' : 'rgba(255,255,255,.1)',
            }}
          />
        );
      })}
    </div>
  );
}

export function ConnDot({ ok }: { ok: boolean }) {
  return (
    <span
      aria-hidden
      style={{ width: 5, height: 5, borderRadius: 999, display: 'block', background: ok ? 'var(--nm-success)' : 'var(--nm-danger)' }}
    />
  );
}

export function SignalPath({ step, compact }: { step: 0 | 1; compact?: boolean }) {
  const labels = ['選人', '驗證', '進入'];
  const gap = compact ? 7 : 8;
  const lineMargin = compact ? '0 10px 16px' : '0 12px 18px';
  const size = compact ? 9.5 : 10;
  const items: React.ReactNode[] = [];
  labels.forEach((label, i) => {
    const state = i < step ? 'done' : i === step ? 'current' : 'future';
    items.push(
      <div key={`node-${i}`} style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap }}>
        <span
          aria-hidden
          style={{
            width: 9,
            height: 9,
            borderRadius: 999,
            display: 'block',
            background: state === 'future' ? 'transparent' : '#f0f0f2',
            opacity: state === 'done' ? 0.55 : 1,
            border: state === 'future' ? '1px solid rgba(255,255,255,.3)' : 'none',
            boxShadow: state === 'current' ? '0 0 12px rgba(240,240,242,.75)' : 'none',
          }}
        />
        <span style={mono(size, state === 'current' ? '#f0f0f2' : state === 'done' ? '#8a8b90' : '#5a5b60', { ls: '.12em' })}>{label}</span>
      </div>
    );
    if (i < labels.length - 1) {
      const done = i < step;
      items.push(
        done ? (
          <span key={`line-${i}`} style={{ flex: 1, height: 1, background: '#f0f0f2', opacity: 0.55, margin: lineMargin, display: 'block' }} />
        ) : (
          <span key={`line-${i}`} style={{ flex: 1, height: 0, borderTop: '1px dashed rgba(255,255,255,.22)', margin: lineMargin, display: 'block' }} />
        )
      );
    }
  });
  return <div style={{ display: 'flex', alignItems: 'center' }}>{items}</div>;
}

export function ChannelStrip({
  index,
  user,
  selected,
  onSelect,
  minHeight,
  numberWidth,
  nameSize,
  roleSize,
  extraShadow,
}: {
  index: number;
  user: ActiveUser;
  selected: boolean;
  onSelect: () => void;
  minHeight: number;
  numberWidth: number;
  nameSize: number;
  roleSize: number;
  extraShadow?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full nm-focus active:scale-[0.99] transition"
      style={{
        display: 'flex',
        alignItems: 'center',
        minHeight,
        borderRadius: 13,
        overflow: 'hidden',
        background: selected ? '#26262b' : 'rgba(30,30,36,.3)',
        boxShadow: selected ? 'inset 0 1px 0 rgba(255,255,255,.05)' : extraShadow ? '0 18px 42px -20px rgba(0,0,0,.85)' : undefined,
        border: selected ? 'none' : '1px solid var(--nm-border-glass)',
      }}
    >
      <span
        aria-hidden
        style={{
          flex: 'none',
          width: 3,
          alignSelf: 'stretch',
          display: 'block',
          background: selected ? 'linear-gradient(180deg,#f0f0f2,rgba(240,240,242,.25))' : 'rgba(255,255,255,.22)',
        }}
      />
      <span style={{ flex: 'none', width: numberWidth, textAlign: 'center', ...mono(10, selected ? '#6d6e73' : '#5a5b60') }}>
        {pad2(index + 1)}
      </span>
      <span style={{ flex: 1, textAlign: 'left', ...sans(nameSize, '#f0f0f2', { weight: 500 }) }}>{user.name}</span>
      <span style={{ flex: 'none', paddingRight: 16, ...sans(roleSize, selected ? '#8a8b90' : '#6d6e73', { ls: '.1em' }) }}>
        {user.role === 'boss' ? '老闆' : '員工'}
      </span>
    </button>
  );
}

export function LevelMeter({ pinLength, submitting, error, height }: { pinLength: number; submitting: boolean; error: boolean; height: number }) {
  const lit = pinLength * 3;
  const peakBg = submitting ? '#f0f0f2' : error ? 'var(--nm-danger)' : 'rgba(8,8,10,.5)';
  const peakBorder = error ? undefined : submitting ? undefined : '1px solid rgba(255,255,255,.14)';
  const peakShadow = error ? '0 0 10px var(--nm-danger)' : undefined;
  const peakSize = height >= 40 ? { w: 28, h: 13 } : { w: 26, h: 12 };
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: height >= 40 ? 7 : 8 }}>
      <div style={{ flex: 1, display: 'flex', gap: 3, height }}>
        {Array.from({ length: 12 }).map((_, i) => {
          const isLit = i < lit;
          return (
            <span
              key={i}
              data-meter-seg
              data-lit={isLit ? '1' : '0'}
              style={{
                flex: 1,
                borderRadius: 0,
                background: isLit ? '#f0f0f2' : 'rgba(8,8,10,.5)',
                boxShadow: isLit ? '0 0 10px rgba(240,240,242,.25)' : undefined,
                border: isLit ? undefined : '1px solid rgba(255,255,255,.1)',
              }}
            />
          );
        })}
      </div>
      <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, paddingBottom: 2 }}>
        <span
          data-peak
          data-state={submitting ? 'submitting' : error ? 'error' : 'idle'}
          style={{ width: peakSize.w, height: peakSize.h, borderRadius: 2, display: 'block', background: peakBg, border: peakBorder, boxShadow: peakShadow }}
        />
        <span style={mono(8.5, '#5a5b60', { ls: '.1em' })}>PEAK</span>
      </div>
    </div>
  );
}

export function MeterScale({ marginBottom }: { marginBottom: number }) {
  const tick = mono(9.5, '#5a5b60');
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom, paddingRight: 38 }}>
      <span style={{ flex: 3, ...tick }}>−20</span>
      <span style={{ flex: 3, ...tick }}>−10</span>
      <span style={{ flex: 3, textAlign: 'right', ...tick }}>0</span>
      <span style={{ flex: 3, textAlign: 'right', ...tick }}>+3</span>
    </div>
  );
}

function DeleteIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 5H9L3 12l6 7h12z" />
      <path d="m13 9 5 6M18 9l-5 6" />
    </svg>
  );
}

export function Keypad({
  submitting,
  pinLength,
  onDigit,
  onBackspace,
  onSwitchUser,
  minHeight,
  fontSize,
  gap,
  iconSize,
  showSwitchUser,
}: {
  submitting: boolean;
  pinLength: number;
  onDigit: (d: string) => void;
  onBackspace: () => void;
  onSwitchUser: () => void;
  minHeight: number;
  fontSize: number;
  gap: number;
  iconSize: number;
  showSwitchUser: boolean;
}) {
  const digitKey: CSSProperties = {
    minHeight,
    borderRadius: 13,
    background: 'rgba(8,8,10,.4)',
    border: '1px solid rgba(255,255,255,.13)',
    boxShadow: 'inset 0 1px 3px rgba(0,0,0,.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    ...mono(fontSize, '#f0f0f2', { weight: 500 }),
  };
  const flatKey: CSSProperties = {
    minHeight,
    borderRadius: 13,
    background: 'rgba(40,40,46,.4)',
    border: '1px solid rgba(255,255,255,.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap, opacity: submitting ? 0.55 : 1 }} className="transition-opacity">
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
        <button key={d} type="button" onClick={() => onDigit(d)} disabled={submitting} className="nm-focus" style={digitKey}>
          {d}
        </button>
      ))}
      {showSwitchUser ? (
        <button type="button" onClick={onSwitchUser} className="nm-focus" style={{ ...flatKey, ...sans(12, '#8a8b90') }}>
          換人
        </button>
      ) : (
        <span aria-hidden />
      )}
      <button type="button" onClick={() => onDigit('0')} disabled={submitting} className="nm-focus" style={digitKey}>
        0
      </button>
      <button
        type="button"
        onClick={onBackspace}
        disabled={submitting || pinLength === 0}
        aria-label="刪除一位"
        className="nm-focus"
        style={{ ...flatKey, color: '#cfcfd2' }}
      >
        <DeleteIcon size={iconSize} />
      </button>
    </div>
  );
}
