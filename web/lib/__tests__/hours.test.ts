import { describe, expect, it } from 'vitest';
import { pairClockinsByDay, summarizeHours, type ClockinLike } from '../hours';

function c(dateTime: string, type: 'in' | 'out'): ClockinLike {
  return { ts: `${dateTime}:00+08:00`, type };
}

describe('pairClockinsByDay', () => {
  it('配對單日單段', () => {
    const [day] = pairClockinsByDay([c('2026-08-14T08:32', 'in'), c('2026-08-14T12:05', 'out')]);
    expect(day.dateKey).toBe('2026-08-14');
    expect(day.pairs).toHaveLength(1);
    expect(day.pairs[0].hours).toBeCloseTo(3.55, 2);
    expect(day.totalHours).toBeCloseTo(3.55, 2);
    expect(day.unpaired).toHaveLength(0);
  });

  it('午休自然扣掉:同日兩段相加', () => {
    const [day] = pairClockinsByDay([
      c('2026-08-14T08:32', 'in'),
      c('2026-08-14T12:05', 'out'),
      c('2026-08-14T13:10', 'in'),
      c('2026-08-14T18:00', 'out'),
    ]);
    expect(day.pairs).toHaveLength(2);
    expect(day.totalHours).toBeCloseTo(8.38, 1);
    expect(day.unpaired).toHaveLength(0);
  });

  it('有進無出:落單的 in 進 unpaired,不計工時', () => {
    const [day] = pairClockinsByDay([c('2026-08-14T08:32', 'in')]);
    expect(day.pairs).toHaveLength(0);
    expect(day.totalHours).toBe(0);
    expect(day.unpaired).toHaveLength(1);
    expect(day.unpaired[0].type).toBe('in');
  });

  it('有出無進:落單的 out 進 unpaired', () => {
    const [day] = pairClockinsByDay([c('2026-08-14T18:00', 'out')]);
    expect(day.pairs).toHaveLength(0);
    expect(day.unpaired).toHaveLength(1);
    expect(day.unpaired[0].type).toBe('out');
  });

  it('連續兩個 in:前一個落單,後一個配對下一個 out', () => {
    const [day] = pairClockinsByDay([
      c('2026-08-14T08:00', 'in'),
      c('2026-08-14T08:30', 'in'),
      c('2026-08-14T12:00', 'out'),
    ]);
    expect(day.pairs).toHaveLength(1);
    expect(day.pairs[0].in).toContain('08:30');
    expect(day.unpaired).toHaveLength(1);
    expect(day.unpaired[0].ts).toContain('08:00');
  });

  it('跨日分組:不同本地日期各自成組', () => {
    const days = pairClockinsByDay([
      c('2026-08-14T08:00', 'in'),
      c('2026-08-14T17:00', 'out'),
      c('2026-08-15T09:00', 'in'),
      c('2026-08-15T18:00', 'out'),
    ]);
    expect(days).toHaveLength(2);
    expect(days.map((d) => d.dateKey)).toEqual(['2026-08-14', '2026-08-15']);
  });

  it('輸入不需預先排序', () => {
    const days = pairClockinsByDay([
      c('2026-08-14T18:00', 'out'),
      c('2026-08-14T08:00', 'in'),
    ]);
    expect(days[0].pairs).toHaveLength(1);
    expect(days[0].totalHours).toBeCloseTo(10, 2);
  });
});

describe('summarizeHours', () => {
  it('加總多日工時,標示是否有未配對', () => {
    const result = summarizeHours([
      c('2026-08-14T08:00', 'in'),
      c('2026-08-14T17:00', 'out'),
      c('2026-08-15T09:00', 'in'), // 落單
    ]);
    expect(result.totalHours).toBeCloseTo(9, 2);
    expect(result.hasUnpaired).toBe(true);
  });

  it('全部配對完整時 hasUnpaired 為 false', () => {
    const result = summarizeHours([
      c('2026-08-14T08:00', 'in'),
      c('2026-08-14T17:00', 'out'),
    ]);
    expect(result.hasUnpaired).toBe(false);
  });

  it('空輸入回傳零工時、無未配對', () => {
    const result = summarizeHours([]);
    expect(result.totalHours).toBe(0);
    expect(result.hasUnpaired).toBe(false);
    expect(result.days).toHaveLength(0);
  });
});
