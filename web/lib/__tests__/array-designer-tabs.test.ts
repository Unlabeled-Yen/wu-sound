// Quantity/Unity/Spacing/Splay 四分頁的 golden 回歸測試。
//
// golden CSV 由 develop/uncoupled-array-mcp/dev/generate_tab_golden.py 產生:
// 直接用原軟體 physics.pyc(oracle)組出同一套接線邏輯算出 ground truth,
// 涵蓋 beta=0 與 beta≠0(beta/phi 比例 0/0.1/0.2/0.3/0.4),每分頁 750 組。
//
// 容忍規則同 array-designer.test.ts:優先比對顯示層(1 位小數)是否一致。

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tabQuantity, tabUnity, tabSpacing, tabSplay } from '../array-designer';

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(',').map((c) => c.trim());
    const row: Record<string, string> = {};
    header.forEach((h, i) => (row[h] = cells[i]));
    return row;
  });
}

function roundTo(x: number, digits: number): number {
  const f = Math.pow(10, digits);
  return Math.round(x * f) / f;
}

function displayMatches(expectedStr: string, got: number): boolean {
  if (expectedStr === 'inf') return !Number.isFinite(got);
  const expected = Number(expectedStr);
  if (roundTo(expected, 1) === roundTo(got, 1)) return true;
  if (Math.abs(expected) < 1e-9) return Math.abs(got) < 1e-3;
  return Math.abs(got - expected) / Math.abs(expected) < 0.02;
}

function loadGolden(name: string) {
  return parseCsv(readFileSync(join(__dirname, name), 'utf8'));
}

describe('array-designer tabs: golden regression (含 beta≠0)', () => {
  describe('Quantity 分頁', () => {
    const rows = loadGolden('TAB_QUANTITY_GOLDEN.csv');
    it(`載入 ${rows.length} 組`, () => expect(rows.length).toBeGreaterThan(700));
    it.each(rows)('$case_id: W=$target_width S=$spacing beta=$beta phi=$phi', (row) => {
      const r = tabQuantity(Number(row.target_width), Number(row.spacing), Number(row.beta), Number(row.phi));
      expect(r.quantity, 'quantity').toBe(Number(row.exp_quantity));
      expect(displayMatches(row.exp_unity_dist, r.unityDistM), 'unityDistM').toBe(true);
      expect(displayMatches(row.exp_rec_width_3db, r.suggestedWidthM), 'suggestedWidthM').toBe(true);
      expect(displayMatches(row.exp_max_width_6db, r.actualWidthM), 'actualWidthM').toBe(true);
      expect(displayMatches(row.exp_range_min, r.rangeMinM), 'rangeMinM').toBe(true);
      expect(displayMatches(row.exp_range_max, r.rangeMaxM), 'rangeMaxM').toBe(true);
    });
  });

  describe('Unity 分頁', () => {
    const rows = loadGolden('TAB_UNITY_GOLDEN.csv');
    it(`載入 ${rows.length} 組`, () => expect(rows.length).toBeGreaterThan(700));
    it.each(rows)('$case_id: N=$quantity S=$spacing beta=$beta phi=$phi', (row) => {
      const r = tabUnity(Number(row.quantity), Number(row.spacing), Number(row.beta), Number(row.phi));
      expect(displayMatches(row.exp_unity_dist, r.unityDistM), 'unityDistM').toBe(true);
      expect(displayMatches(row.exp_rec_width_3db, r.suggestedWidthM), 'suggestedWidthM').toBe(true);
      expect(displayMatches(row.exp_max_width_6db, r.actualWidthM), 'actualWidthM').toBe(true);
      expect(displayMatches(row.exp_range_min, r.rangeMinM), 'rangeMinM').toBe(true);
      expect(displayMatches(row.exp_range_max, r.rangeMaxM), 'rangeMaxM').toBe(true);
    });
  });

  describe('Spacing 分頁', () => {
    const rows = loadGolden('TAB_SPACING_GOLDEN.csv');
    it(`載入 ${rows.length} 組`, () => expect(rows.length).toBeGreaterThan(700));
    it.each(rows)('$case_id: N=$quantity D=$target_unity beta=$beta phi=$phi', (row) => {
      const r = tabSpacing(Number(row.quantity), Number(row.target_unity), Number(row.beta), Number(row.phi));
      expect(displayMatches(row.exp_req_spacing, r.spacingM), 'spacingM').toBe(true);
      expect(displayMatches(row.exp_rec_width_3db, r.suggestedWidthM), 'suggestedWidthM').toBe(true);
      expect(displayMatches(row.exp_max_width_6db, r.actualWidthM), 'actualWidthM').toBe(true);
      expect(displayMatches(row.exp_range_min, r.rangeMinM), 'rangeMinM').toBe(true);
      expect(displayMatches(row.exp_range_max, r.rangeMaxM), 'rangeMaxM').toBe(true);
    });
  });

  describe('Splay 分頁', () => {
    const rows = loadGolden('TAB_SPLAY_GOLDEN.csv');
    it(`載入 ${rows.length} 組`, () => expect(rows.length).toBeGreaterThan(700));
    it.each(rows)('$case_id: N=$quantity D=$target_unity S=$spacing phi=$phi', (row) => {
      const r = tabSplay(Number(row.quantity), Number(row.target_unity), Number(row.spacing), Number(row.phi));
      expect(displayMatches(row.exp_req_splay, r.splayDeg), 'splayDeg').toBe(true);
      expect(displayMatches(row.exp_rec_width_3db, r.suggestedWidthM), 'suggestedWidthM').toBe(true);
      expect(displayMatches(row.exp_max_width_6db, r.actualWidthM), 'actualWidthM').toBe(true);
      expect(displayMatches(row.exp_range_min, r.rangeMinM), 'rangeMinM').toBe(true);
      expect(displayMatches(row.exp_range_max, r.rangeMaxM), 'rangeMaxM').toBe(true);
    });
  });
});
