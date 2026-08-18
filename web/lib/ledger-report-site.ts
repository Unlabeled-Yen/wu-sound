import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

// 報表中心「按案子」維度(＝專案損益表)。強制期間=整案期(見 report-period-dimension.ts),
// 所以這裡不吃 from/to,永遠讀該案場的全部歷史。
//
// 裁決 ③(17-reports-center.md §1):第一版不算人力分攤,毛利只含直接成本。
// 「代墊」欄不能從 ledger_entries 讀——月結把零用金依人彙總成一筆,案場資訊在那一刻消失
// (ledger-master-spec.md §5.1)。改讀 expenses 表(site_id 還在),只計已核准/已入帳的收據,
// 跟 PayrollView.tsx 的 counted 規則(status confirmed 或 booked)保持一致。

const NON_OPERATING_KINDS = new Set(['loan', 'investment', 'health']);
const RETIRED_KINDS = new Set(['credit_card']);

export interface SiteReportRow {
  siteId: string | null; // null = 未歸類殘差列
  label: string;
  revenue: number;
  directCost: number;
  advance: number;
  margin: number;
  marginRate: number | null; // revenue = 0 時 null(不適用,顯示 —)
}

export interface SiteReport {
  rows: SiteReportRow[]; // 不含殘差列,已排序(revenue 由大到小)
  residual: SiteReportRow | null; // 未歸類——site_id 為 null 的分錄,revenue=0 時不回傳(不渲染)
  total: SiteReportRow;
}

export interface SiteReportEntryRow {
  site_id: string | null;
  direction: 'income' | 'expense';
  kind: string;
  amount_twd: number;
}

export interface SiteReportExpenseRow {
  site_id: string | null;
  amount_twd: number | null;
}

/**
 * 按案子維度彙總的唯一實作——純函式,不碰資料庫,方便單元測試恆等式與殘差規則。
 * buildSiteReport() 只負責抓資料再呼叫這裡。
 */
export function aggregateSiteReport(
  entries: SiteReportEntryRow[],
  siteNames: Map<string, string>,
  expenses: SiteReportExpenseRow[],
): SiteReport {
  const advanceBySite = new Map<string | null, number>();
  for (const e of expenses) {
    const key = e.site_id;
    advanceBySite.set(key, (advanceBySite.get(key) ?? 0) + (e.amount_twd ?? 0));
  }

  interface Acc { revenue: number; directCost: number }
  const bySite = new Map<string | null, Acc>();
  const touch = (siteId: string | null) => {
    if (!bySite.has(siteId)) bySite.set(siteId, { revenue: 0, directCost: 0 });
    return bySite.get(siteId)!;
  };

  for (const e of entries) {
    // 業外/個人項(借款、投資、健檢)與已退役類別不進案子損益——那是公司整體的業外項,
    // 不屬於任何一個案子的經營結果。
    if (NON_OPERATING_KINDS.has(e.kind) || RETIRED_KINDS.has(e.kind)) continue;
    const acc = touch(e.site_id);
    if (e.direction === 'income') acc.revenue += e.amount_twd;
    // 代墊(reimbursement)不算進「直接成本」——它是獨立一欄,來源是 expenses 表不是 ledger_entries。
    else if (e.kind !== 'reimbursement') acc.directCost += e.amount_twd;
  }

  // 確保曾出現在 expenses 但完全沒有 ledger_entries 分錄的案場,也要出現(不能因為只有代墊就消失)。
  for (const siteId of advanceBySite.keys()) touch(siteId);

  const toRow = (siteId: string | null, acc: Acc): SiteReportRow => {
    const advance = advanceBySite.get(siteId) ?? 0;
    const margin = acc.revenue - acc.directCost - advance;
    return {
      siteId,
      label: siteId ? (siteNames.get(siteId) ?? '(已刪除案場)') : '未歸類(沒有掛案場)',
      revenue: acc.revenue,
      directCost: acc.directCost,
      advance,
      margin,
      marginRate: acc.revenue > 0 ? margin / acc.revenue : null,
    };
  };

  const rows: SiteReportRow[] = [];
  let residual: SiteReportRow | null = null;
  for (const [siteId, acc] of bySite) {
    const row = toRow(siteId, acc);
    if (siteId === null) {
      // 沒有殘差時列不渲染(不是顯示 0)——只有真的有金額的未歸類分錄才回傳這一列。
      if (row.revenue !== 0 || row.directCost !== 0 || row.advance !== 0) residual = row;
    } else {
      rows.push(row);
    }
  }
  rows.sort((a, b) => b.revenue - a.revenue);

  const totalAcc: Acc = { revenue: 0, directCost: 0 };
  let totalAdvance = 0;
  for (const r of rows) { totalAcc.revenue += r.revenue; totalAcc.directCost += r.directCost; totalAdvance += r.advance; }
  if (residual) { totalAcc.revenue += residual.revenue; totalAcc.directCost += residual.directCost; totalAdvance += residual.advance; }
  const totalMargin = totalAcc.revenue - totalAcc.directCost - totalAdvance;
  const total: SiteReportRow = {
    siteId: null,
    label: '合計',
    revenue: totalAcc.revenue,
    directCost: totalAcc.directCost,
    advance: totalAdvance,
    margin: totalMargin,
    marginRate: totalAcc.revenue > 0 ? totalMargin / totalAcc.revenue : null,
  };

  return { rows, residual, total };
}

export async function buildSiteReport(sb: SupabaseClient): Promise<{ report: SiteReport | null; error: string | null }> {
  const [entriesRes, sitesRes, expensesRes] = await Promise.all([
    sb.from('ledger_entries').select('site_id, direction, kind, amount_twd').eq('state', 'posted'),
    sb.from('sites').select('id, name'),
    sb.from('expenses').select('site_id, amount_twd').in('status', ['confirmed', 'booked']),
  ]);
  if (entriesRes.error) return { report: null, error: entriesRes.error.message };
  if (sitesRes.error) return { report: null, error: sitesRes.error.message };
  if (expensesRes.error) return { report: null, error: expensesRes.error.message };

  const siteNames = new Map<string, string>((sitesRes.data ?? []).map((s: { id: string; name: string }) => [s.id, s.name]));
  const entries = (entriesRes.data ?? []) as SiteReportEntryRow[];
  const expenses = (expensesRes.data ?? []) as SiteReportExpenseRow[];

  return { report: aggregateSiteReport(entries, siteNames, expenses), error: null };
}
