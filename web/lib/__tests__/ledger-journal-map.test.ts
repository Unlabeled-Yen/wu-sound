import { describe, expect, it } from 'vitest';
import {
  KIND_TO_JOURNAL,
  INCOME_KINDS,
  EXPENSE_KINDS,
  JOURNAL_KINDS,
  JOURNAL_ORDER,
  directionOfKind,
  journalOfKind,
  type LedgerKind,
} from '../types';

// 除 credit_card 外的全部 kind——它已從新增表單的可選清單退役(v3),
// 但型別仍保留給舊資料,所以窮舉測試要刻意排除它,不然這條測試會跟著舊資料一起過期。
const ALL_CURRENT_KINDS: LedgerKind[] = [...INCOME_KINDS, ...EXPENSE_KINDS];

describe('KIND_TO_JOURNAL 完備性', () => {
  it('每個現行 kind 都對應得到帳簿——新增 kind 忘了配帳簿,要在這裡炸,不要在正式站 API 400', () => {
    for (const kind of ALL_CURRENT_KINDS) {
      expect(KIND_TO_JOURNAL[kind], `kind "${kind}" 沒有配到 journal`).toBeDefined();
    }
  });

  it('credit_card 刻意不在對應表裡(已退役,不接受新分錄)', () => {
    expect(KIND_TO_JOURNAL.credit_card).toBeUndefined();
  });

  it('JOURNAL_KINDS 是 KIND_TO_JOURNAL 的完整反向索引,兩邊筆數一致', () => {
    const totalInJournalKinds = JOURNAL_ORDER.reduce((s, j) => s + JOURNAL_KINDS[j].length, 0);
    expect(totalInJournalKinds).toBe(Object.keys(KIND_TO_JOURNAL).length);
  });
});

describe('INCOME_KINDS / EXPENSE_KINDS 互斥且完備', () => {
  it('兩份清單沒有交集', () => {
    const overlap = INCOME_KINDS.filter((k) => (EXPENSE_KINDS as LedgerKind[]).includes(k));
    expect(overlap).toEqual([]);
  });

  it('兩份清單合起來等於全部現行 kind(除 credit_card)', () => {
    const union = new Set([...INCOME_KINDS, ...EXPENSE_KINDS]);
    expect(union.size).toBe(INCOME_KINDS.length + EXPENSE_KINDS.length);
  });
});

describe('directionOfKind', () => {
  it('INCOME_KINDS 裡的每個 kind 都判為 income', () => {
    for (const kind of INCOME_KINDS) {
      expect(directionOfKind(kind)).toBe('income');
    }
  });

  it('EXPENSE_KINDS 裡的每個 kind 都判為 expense', () => {
    for (const kind of EXPENSE_KINDS) {
      expect(directionOfKind(kind)).toBe('expense');
    }
  });
});

describe('journalOfKind', () => {
  it('每個現行 kind 找到的帳簿,跟 KIND_TO_JOURNAL 查表結果一致', () => {
    for (const kind of ALL_CURRENT_KINDS) {
      expect(journalOfKind(kind, 'vendor')).toBe(KIND_TO_JOURNAL[kind]);
    }
  });

  it('查不到時回傳 fallback,不是拋錯——已退役的 credit_card 走這條路', () => {
    expect(journalOfKind('credit_card', 'vendor')).toBe('vendor');
  });
});
