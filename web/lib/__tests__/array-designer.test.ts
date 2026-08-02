// 陣列計算 golden 回歸測試。
//
// golden CSV 的 945 組 ground truth 來自 Uncoupled Array Designer v1.7 原軟體
// (physics.pyc 當黑盒 oracle 窮舉產生),詳見 develop/uncoupled-array-mcp/。
// 這裡驗證的是「TypeScript port 是否與 Python 版本、與原軟體行為一致」,
// 不是驗證公式本身的物理正確性(那件事已經在 Python 端做過 2081 組交叉驗證)。
//
// 容忍規則:app 顯示只到小數點後 1 位,所以優先比對「四捨五入到 1 位小數是否一致」,
// 這樣才不會因為浮點精度誤差而誤判 fail。

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { autoMode, type ForceQty } from '../array-designer';

interface GoldenRow {
  case_id: string;
  target_width: string;
  audience_dist: string;
  speaker_cov: string;
  force_qty: string;
  expected_qty: string;
  expected_spacing: string;
  expected_covw_3db: string;
  expected_range_min: string;
  expected_range_max: string;
  expected_unity_6db: string;
}

function parseCsv(text: string): GoldenRow[] {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(',').map((c) => c.trim());
    const row = {} as Record<string, string>;
    header.forEach((h, i) => (row[h] = cells[i]));
    return row as unknown as GoldenRow;
  });
}

function roundTo(x: number, digits: number): number {
  const f = Math.pow(10, digits);
  return Math.round(x * f) / f;
}

// 顯示層一致(四捨五入到 1 位小數相同)就算過;否則退回 2% 相對誤差容忍。
function displayMatches(expected: number, got: number): boolean {
  if (roundTo(expected, 1) === roundTo(got, 1)) return true;
  if (Math.abs(expected) < 1e-9) return Math.abs(got) < 1e-3;
  return Math.abs(got - expected) / Math.abs(expected) < 0.02;
}

const csvPath = join(__dirname, 'array-designer.golden.csv');
const rows = parseCsv(readFileSync(csvPath, 'utf8'));

describe('array-designer: golden regression (945 cases)', () => {
  it(`載入了 ${rows.length} 組 golden case`, () => {
    expect(rows.length).toBeGreaterThan(900);
  });

  it.each(rows)('$case_id: target=$target_width D=$audience_dist cov=$speaker_cov force=$force_qty', (row) => {
    const got = autoMode(
      Number(row.target_width),
      Number(row.audience_dist),
      Number(row.speaker_cov),
      row.force_qty as ForceQty,
    );

    expect(got.quantity, 'quantity').toBe(Number(row.expected_qty));
    expect(displayMatches(Number(row.expected_spacing), got.spacingM), 'spacingM').toBe(true);
    expect(displayMatches(Number(row.expected_covw_3db), got.coverageWidth3dbM), 'coverageWidth3dbM').toBe(true);
    expect(displayMatches(Number(row.expected_range_min), got.rangeMinM ?? NaN), 'rangeMinM').toBe(true);
    expect(displayMatches(Number(row.expected_range_max), got.rangeMaxM ?? NaN), 'rangeMaxM').toBe(true);
    expect(displayMatches(Number(row.expected_unity_6db), got.unityDist6dbM), 'unityDist6dbM').toBe(true);
  });
});
