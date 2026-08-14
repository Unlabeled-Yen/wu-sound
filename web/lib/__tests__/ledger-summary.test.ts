import { describe, expect, it } from 'vitest';
import { summarizeEntries, type LedgerSummaryRow } from '../ledger-summary';

describe('summarizeEntries', () => {
  it('淨額扣手續費——批 0 的修正不許回退', () => {
    const rows: LedgerSummaryRow[] = [
      { direction: 'income', amount_twd: 10000, fee_twd: 0 },
      { direction: 'expense', amount_twd: 3000, fee_twd: 15 },
    ];
    const s = summarizeEntries(rows);
    expect(s.income).toBe(10000);
    expect(s.expense).toBe(3000);
    expect(s.feeTotal).toBe(15);
    // 10000 - 3000 - 15,不是 10000 - 3000
    expect(s.net).toBe(6985);
  });

  it('空陣列回全零,不是 NaN', () => {
    const s = summarizeEntries([]);
    expect(s).toEqual({ income: 0, expense: 0, feeTotal: 0, net: 0, extIncome: 0, extTax: 0 });
  });

  it('外帳彙總只計 is_external=true 的列', () => {
    const rows: LedgerSummaryRow[] = [
      { direction: 'income', amount_twd: 5000, is_external: true, tax_amount_twd: 250 },
      { direction: 'income', amount_twd: 2000, is_external: false, tax_amount_twd: 0 },
      { direction: 'expense', amount_twd: 1000, is_external: true, tax_amount_twd: 50 },
    ];
    const s = summarizeEntries(rows);
    // extIncome 只算外帳的收入,不含外帳支出、不含內帳收入
    expect(s.extIncome).toBe(5000);
    // extTax 是外帳的稅額合計,收入支出都算(對應原本 ledger 頁的口徑)
    expect(s.extTax).toBe(300);
  });

  it('呼叫端負責只餵 active 列——函式本身不過濾 voided,餵什麼就算什麼', () => {
    // 這條測試把「過濾責任在查詢端」寫成文件:函式收到 voided 列也會照算,
    // 表示呼叫方(頁面查詢)必須自己先過濾掉 voided,不能指望這裡幫忙擋。
    const rows: LedgerSummaryRow[] = [
      { direction: 'expense', amount_twd: 999, fee_twd: 0 },
    ];
    const s = summarizeEntries(rows);
    expect(s.expense).toBe(999);
  });

  it('缺少 fee_twd/tax_amount_twd/is_external 時視為 0/false,不炸', () => {
    const rows: LedgerSummaryRow[] = [{ direction: 'income', amount_twd: 100 }];
    const s = summarizeEntries(rows);
    expect(s.net).toBe(100);
    expect(s.extIncome).toBe(0);
  });
});
