import { describe, expect, it } from 'vitest';
import { computePayrollSyncPlan, type PayrollSyncExisting, type PayrollSyncTarget } from '../payroll-sync';

const OCCURRED_ON = '2026-08-10';

describe('computePayrollSyncPlan', () => {
  it('新人有薪資但帳上還沒有分錄,進 toInsert', () => {
    const targets: PayrollSyncTarget[] = [{ party: 'Raymond', kind: 'salary', amount_twd: 70000, memo: '8月薪資結算' }];
    const plan = computePayrollSyncPlan(targets, [], OCCURRED_ON);
    expect(plan.toInsert).toEqual(targets);
    expect(plan.toUpdate).toEqual([]);
    expect(plan.toVoid).toEqual([]);
  });

  it('金額改變,進 toUpdate 而不是 toInsert', () => {
    const targets: PayrollSyncTarget[] = [{ party: 'Raymond', kind: 'salary', amount_twd: 75000, memo: '8月薪資結算' }];
    const existing: PayrollSyncExisting[] = [
      { id: 'e1', party: 'Raymond', kind: 'salary', amount_twd: 70000, memo: '8月薪資結算', occurred_on: OCCURRED_ON },
    ];
    const plan = computePayrollSyncPlan(targets, existing, OCCURRED_ON);
    expect(plan.toInsert).toEqual([]);
    expect(plan.toUpdate).toEqual([{ id: 'e1', party: 'Raymond', kind: 'salary', amount_twd: 75000, memo: '8月薪資結算' }]);
    expect(plan.toVoid).toEqual([]);
  });

  it('金額備註都沒變,不做任何事', () => {
    const targets: PayrollSyncTarget[] = [{ party: 'Raymond', kind: 'salary', amount_twd: 70000, memo: '8月薪資結算' }];
    const existing: PayrollSyncExisting[] = [
      { id: 'e1', party: 'Raymond', kind: 'salary', amount_twd: 70000, memo: '8月薪資結算', occurred_on: OCCURRED_ON },
    ];
    const plan = computePayrollSyncPlan(targets, existing, OCCURRED_ON);
    expect(plan.toInsert).toEqual([]);
    expect(plan.toUpdate).toEqual([]);
    expect(plan.toVoid).toEqual([]);
  });

  it('舊制分錄日期是月底,同步時要修正成 10 號,就算金額沒變也要更新', () => {
    const targets: PayrollSyncTarget[] = [{ party: 'Raymond', kind: 'salary', amount_twd: 70000, memo: '8月薪資結算' }];
    const existing: PayrollSyncExisting[] = [
      { id: 'e1', party: 'Raymond', kind: 'salary', amount_twd: 70000, memo: '8月薪資結算', occurred_on: '2026-08-31' },
    ];
    const plan = computePayrollSyncPlan(targets, existing, OCCURRED_ON);
    expect(plan.toUpdate).toEqual([{ id: 'e1', party: 'Raymond', kind: 'salary', amount_twd: 70000, memo: '8月薪資結算' }]);
  });

  it('獎金拿掉(不在 targets 裡)時,既有分錄要作廢', () => {
    const targets: PayrollSyncTarget[] = [{ party: 'Raymond', kind: 'salary', amount_twd: 70000, memo: '8月薪資結算' }];
    const existing: PayrollSyncExisting[] = [
      { id: 'e1', party: 'Raymond', kind: 'salary', amount_twd: 70000, memo: '8月薪資結算', occurred_on: OCCURRED_ON },
      { id: 'e2', party: 'Raymond', kind: 'bonus', amount_twd: 5000, memo: '8月獎金', occurred_on: OCCURRED_ON },
    ];
    const plan = computePayrollSyncPlan(targets, existing, OCCURRED_ON);
    expect(plan.toVoid).toEqual([{ id: 'e2', party: 'Raymond', kind: 'bonus' }]);
    expect(plan.toUpdate).toEqual([]);
  });

  it('同一人薪資/獎金/代墊三種 kind 各自獨立比對,不會互相蓋掉', () => {
    const targets: PayrollSyncTarget[] = [
      { party: 'Raymond', kind: 'salary', amount_twd: 70000, memo: '8月薪資結算' },
      { party: 'Raymond', kind: 'bonus', amount_twd: 5000, memo: '8月獎金' },
      { party: 'Raymond', kind: 'reimbursement', amount_twd: 1234, memo: '8月零用金結算' },
    ];
    const plan = computePayrollSyncPlan(targets, [], OCCURRED_ON);
    expect(plan.toInsert).toHaveLength(3);
  });

  it('不同人同一種 kind 不會互相比對到', () => {
    const targets: PayrollSyncTarget[] = [{ party: '書韶', kind: 'salary', amount_twd: 32000, memo: '8月薪資結算' }];
    const existing: PayrollSyncExisting[] = [
      { id: 'e1', party: '學長', kind: 'salary', amount_twd: 35000, memo: '8月薪資結算', occurred_on: OCCURRED_ON },
    ];
    const plan = computePayrollSyncPlan(targets, existing, OCCURRED_ON);
    expect(plan.toInsert).toEqual(targets);
    expect(plan.toVoid).toEqual([{ id: 'e1', party: '學長', kind: 'salary' }]);
  });

  it('新代墊審核通過後金額變大,既有代墊分錄更新到新總額', () => {
    const targets: PayrollSyncTarget[] = [{ party: '書韶', kind: 'reimbursement', amount_twd: 3000, memo: '8月零用金結算' }];
    const existing: PayrollSyncExisting[] = [
      { id: 'e1', party: '書韶', kind: 'reimbursement', amount_twd: 1234, memo: '8月零用金結算', occurred_on: OCCURRED_ON },
    ];
    const plan = computePayrollSyncPlan(targets, existing, OCCURRED_ON);
    expect(plan.toUpdate).toEqual([{ id: 'e1', party: '書韶', kind: 'reimbursement', amount_twd: 3000, memo: '8月零用金結算' }]);
  });
});
