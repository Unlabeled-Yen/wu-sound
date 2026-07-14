'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

type ToastKind = 'success' | 'error' | 'info';
type Toast = { id: number; kind: ToastKind; text: string };
type Ctx = {
  toast: (text: string, kind?: ToastKind) => void;
  success: (text: string) => void;
  error: (text: string) => void;
};

const ToastCtx = createContext<Ctx | null>(null);

export function useToast(): Ctx {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const toast = useCallback((text: string, kind: ToastKind = 'info') => {
    const id = nextId++;
    setItems((cur) => [...cur, { id, kind, text }]);
    setTimeout(() => {
      setItems((cur) => cur.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const api: Ctx = {
    toast,
    success: (t) => toast(t, 'success'),
    error: (t) => toast(t, 'error'),
  };

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="fixed top-6 right-6 z-[60] flex flex-col gap-2 pointer-events-none">
        {items.map((t) => (
          <ToastCard key={t.id} kind={t.kind} text={t.text} onClose={() =>
            setItems((cur) => cur.filter((x) => x.id !== t.id))
          } />
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

function ToastCard({
  kind,
  text,
  onClose,
}: {
  kind: ToastKind;
  text: string;
  onClose: () => void;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);
  const dotColor = {
    success: 'var(--nm-success)',
    error: 'var(--nm-danger)',
    info: 'var(--nm-text-secondary)',
  }[kind];
  return (
    <div
      className={`pointer-events-auto min-w-[260px] max-w-sm rounded-2xl nm-raised px-4 py-3 flex items-start gap-3 transition-all duration-200 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
      }`}
      style={{ color: 'var(--nm-text-primary)' }}
    >
      <span
        className="mt-1.5 w-2 h-2 rounded-full shrink-0"
        style={{ background: dotColor }}
      />
      <div className="flex-1 text-[13px] leading-relaxed">{text}</div>
      <button
        type="button"
        onClick={onClose}
        aria-label="關閉"
        className="text-xs nm-focus"
        style={{ color: 'var(--nm-text-muted)' }}
      >
        ✕
      </button>
    </div>
  );
}
