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
