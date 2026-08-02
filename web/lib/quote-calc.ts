import type { QuoteLine } from './types';

export interface QuoteLineGroups {
  equipment: QuoteLine[];
  install: QuoteLine[];
  equipmentSubtotal: number;
  installSubtotal: number;
  missingCount: number;
}

// 分區(器材/安裝) + 各區小計。缺價的行不計入小計,但仍計入 missingCount,
// 呼叫端要靠 missingCount > 0 判斷「不可顯示完整總額」— 缺價 loud 原則。
export function groupQuoteLines(lines: QuoteLine[]): QuoteLineGroups {
  const equipment = lines.filter((l) => l.section !== '安裝');
  const install = lines.filter((l) => l.section === '安裝');

  let equipmentSubtotal = 0;
  let installSubtotal = 0;
  let missingCount = 0;

  for (const l of equipment) {
    if (l.unit_price_twd === null || l.unit_price_twd === undefined) missingCount += 1;
    else equipmentSubtotal += l.qty * l.unit_price_twd;
  }
  for (const l of install) {
    if (l.unit_price_twd === null || l.unit_price_twd === undefined) missingCount += 1;
    else installSubtotal += l.qty * l.unit_price_twd;
  }

  return { equipment, install, equipmentSubtotal, installSubtotal, missingCount };
}

export interface QuoteTotals {
  total: number; // 器材小計 + 安裝小計(母版原本的 Total 公式有誤,只算了安裝,這裡修正為完整加總)
  tax: number; // Total * tax_rate
  grandTotal: number; // Total + tax
}

export function computeQuoteTotals(groups: QuoteLineGroups, taxRate: number): QuoteTotals {
  const total = groups.equipmentSubtotal + groups.installSubtotal;
  const tax = Math.round(total * taxRate);
  const grandTotal = total + tax;
  return { total, tax, grandTotal };
}

// 毛利計算(僅內部/老闆可見,絕不出現在給客戶的列印/匯出頁面)。
// 不含人事成本,只算品項進價 vs 售價的差。缺進價資料的行不計入,
// 不能拿「有資料的部分」冒充「整張報價的真實毛利」— 缺就 loud 原則。

export interface LineMargin {
  costKnown: boolean;
  marginTwd: number | null;
  marginPct: number | null; // 0-100
}

export function computeLineMargin(line: QuoteLine, unitCostTwd: number | null | undefined): LineMargin {
  if (line.unit_price_twd == null || unitCostTwd == null) {
    return { costKnown: false, marginTwd: null, marginPct: null };
  }
  const revenue = line.qty * line.unit_price_twd;
  const cost = line.qty * unitCostTwd;
  const marginTwd = revenue - cost;
  const marginPct = revenue > 0 ? (marginTwd / revenue) * 100 : null;
  return { costKnown: true, marginTwd, marginPct };
}

export interface QuoteMarginSummary {
  knownRevenue: number;
  knownCost: number;
  marginTwd: number;
  marginPct: number | null;
  coveredLines: number;
  totalLines: number;
}

export function computeQuoteMargin(
  lines: QuoteLine[],
  costByItemId: Record<string, number | null | undefined>,
): QuoteMarginSummary {
  let knownRevenue = 0;
  let knownCost = 0;
  let coveredLines = 0;
  for (const line of lines) {
    const unitCost = line.catalog_item_id ? costByItemId[line.catalog_item_id] : undefined;
    const m = computeLineMargin(line, unitCost);
    if (m.costKnown && line.unit_price_twd != null && unitCost != null) {
      knownRevenue += line.qty * line.unit_price_twd;
      knownCost += line.qty * unitCost;
      coveredLines += 1;
    }
  }
  const marginTwd = knownRevenue - knownCost;
  const marginPct = knownRevenue > 0 ? (marginTwd / knownRevenue) * 100 : null;
  return { knownRevenue, knownCost, marginTwd, marginPct, coveredLines, totalLines: lines.length };
}
