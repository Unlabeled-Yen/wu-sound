import type { CSSProperties } from 'react';
import type { QuoteStatus } from '@/lib/types';

// 狀態 pill 的樣式對照——編輯器決策欄跟列表頁的狀態 pill 是同一件事,
// 只寫一次,不要各自一份會漂移的顏色表。
export const QUOTE_STATUS_PILL_CLASS: Record<QuoteStatus, string> = {
  draft: 'nm-pill-muted',
  sent: 'nm-pill-neutral',
  won: '',
  lost: 'nm-pill-danger',
};
export const QUOTE_STATUS_PILL_STYLE: Partial<Record<QuoteStatus, CSSProperties>> = {
  won: {
    color: 'var(--nm-success-glass-text)',
    background: 'rgba(126, 207, 157, 0.08)',
    borderColor: 'rgba(126, 207, 157, 0.26)',
  },
};
