import { getSupabaseAdmin } from '@/lib/supabase';
import { buildIncomeStatement, type ReportEntryRow } from '@/lib/ledger-report-summary';
import { buildSiteReport } from '@/lib/ledger-report-site';
import { fetchReceivablesWithRemaining } from '@/lib/receivables-query';
import {
  PERIOD_OPTIONS, DIMENSION_OPTIONS, DIMENSION_LINKAGE,
  resolvePeriodForDimension, isPeriodDisabledForDimension, currentPeriodValue,
  taxPeriodLabel, taxPeriodRange,
  type PeriodType, type Dimension,
} from '@/lib/report-period-dimension';
import { PrintButton } from './PrintButton';
import { ReportsCategoryTable } from './ReportsCategoryTable';
import { ReportsSiteTable } from './ReportsSiteTable';
import { ReportsSidebar } from './ReportsSidebar';
import { ReportsDrillDrawer, type DrillRow } from './ReportsDrillDrawer';
import {
  buildHref, currentMonth, currentQuarter, currentYear, fmt,
  monthRange, reportPeriodRange, shiftMonth, shiftQuarter, NO_SITE, type SP,
} from './ledger-page-helpers';

// 報表中心 22c——一張表 × 兩個旋鈕。定案 2026-08-18,見
// docs/design_handoff_wu_sound/17-reports-center.md。四份報表(brief v1 第 3 節)
// 是同一張表的四種切法,不是四個分頁(那是被否決的 22a)。
//
// 裁決 ③:第一版不算人力分攤、不顯示未分攤池——day_site_allocations 尚未接進
// 報表計算(ledger-master-spec.md §5.3)。這修改了 reports-center-shape-brief-v1
// 的 R3,brief 需要出 v2 記錄這件事。
export async function ReportsView({ sb, base, dim: dimParam, period: periodParam, pv: pvParam, drill }: {
  sb: ReturnType<typeof getSupabaseAdmin>;
  base: SP;
  dim?: string;
  period?: string;
  pv?: string;
  drill?: string;
}) {
  const dim: Dimension = (DIMENSION_OPTIONS.some((d) => d.key === dimParam) ? dimParam : 'category') as Dimension;
  const requestedPeriod: PeriodType = (PERIOD_OPTIONS.some((p) => p.key === periodParam) ? periodParam : DIMENSION_LINKAGE[dim].default ?? 'month') as PeriodType;
  const { period, forceReason } = resolvePeriodForDimension(dim, requestedPeriod);
  const periodValue = pvParam || currentPeriodValue(period);

  const range = periodRangeFor(period, periodValue);

  // 分維度抓資料。category 需要期間範圍;site 強制整案期,不吃 range。
  let categoryData: Awaited<ReturnType<typeof loadCategory>> | null = null;
  let siteData: Awaited<ReturnType<typeof buildSiteReport>> | null = null;
  let loadError: { area: string; message: string } | null = null;

  if (dim === 'site') {
    siteData = await buildSiteReport(sb);
    if (siteData.error) loadError = { area: '按案子維度', message: siteData.error };
  } else if (dim === 'category' && range) {
    categoryData = await loadCategory(sb, range);
    if (categoryData.error) loadError = { area: '按類別維度', message: categoryData.error };
  }
  // person/books 兩個維度目前沒有對應的表格實作(17-reports-center.md 定案的五個
  // commit 沒有涵蓋這兩個)——誠實顯示尚未實作,不畫一個假裝有資料的空表。

  // 側欄「已收付 vs 未收付」永遠用本月數字,不跟著主表的期間/維度旋鈕走——
  // 案子維度強制整案期沒有自然的「本期」,稅務維度是兩月期,兩者都不適合當側欄基準。
  // 側欄要的是「現在的錢況」,固定用當月才能在任何旋鈕組合下都有意義。
  const sidebarRange = monthRange(currentMonth());
  const [sidebarEntriesRes, openReceivablesRes] = await Promise.all([
    sb.from('ledger_entries').select('direction, amount_twd').eq('state', 'posted').gte('occurred_on', sidebarRange.from).lte('occurred_on', sidebarRange.to),
    fetchReceivablesWithRemaining(sb, { status: 'open' }),
  ]);
  const sidebarError = sidebarEntriesRes.error?.message ?? openReceivablesRes.error ?? null;
  if (sidebarError && !loadError) loadError = { area: '側欄已收付', message: sidebarError };

  const sidebarRows = (sidebarEntriesRes.data ?? []) as Array<{ direction: 'income' | 'expense'; amount_twd: number }>;
  const settledIncome = sidebarRows.filter((r) => r.direction === 'income').reduce((s, r) => s + r.amount_twd, 0);
  const settledExpense = sidebarRows.filter((r) => r.direction === 'expense').reduce((s, r) => s + r.amount_twd, 0);
  const unsettledIncome = openReceivablesRes.rows.filter((r) => r.direction === 'receivable').reduce((s, r) => s + Math.max(0, r.remaining_twd), 0);
  const unsettledExpense = openReceivablesRes.rows.filter((r) => r.direction === 'payable').reduce((s, r) => s + Math.max(0, r.remaining_twd), 0);

  const humanCostNote = dim === 'site'
    ? '不含人力成本。員工工時尚未接入報表計算,所以「薪資」只以類別總額出現,不會分攤到各案子。按案子的毛利因此是「只含直接成本」的毛利。'
    : '不含人力成本。員工工時尚未接入報表計算,薪資只以類別總額出現。';

  const drillHrefFor = (key: string) => buildHref(base, { drill: key });
  const drawer = drill ? await loadDrawer(sb, dim, drill, range, base) : null;

  const exportDisabledReason = loadError ? `${loadError.area}讀取失敗(${loadError.message})` : null;
  const dimMeta = DIMENSION_OPTIONS.find((d) => d.key === dim)!;
  const periodLabel = periodDisplayLabel(period, periodValue);

  return (
    <div className="lg:h-full lg:overflow-y-auto lg:pr-1" data-reports-page="root">
      <div className="rounded-2xl nm-raised" style={{ maxWidth: 1440 }}>
        <div className="no-print" style={{ padding: '20px 28px 18px', borderBottom: '1px solid var(--nm-border-hair)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ font: '400 11px/1 inherit', letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--nm-text-muted)', marginBottom: 7 }}>帳務</div>
            <div style={{ font: '600 20px/1 inherit', color: 'var(--nm-text-primary)' }}>報表中心</div>
            <div style={{ font: '400 13px/1 inherit', color: 'var(--nm-text-secondary)', marginTop: 4 }}>一張表　·　兩個旋鈕</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <PrintButton disabled={!!exportDisabledReason} disabledReason={exportDisabledReason} />
            <button type="button" disabled className="nm-btn" style={{ minHeight: 38, borderRadius: 11, fontSize: 12.5, opacity: 0.5, cursor: 'not-allowed' }} title="給記帳士的 Excel 匯出尚未實作">
              給記帳士的 Excel
            </button>
          </div>
        </div>

        <ReportKnobs base={base} dim={dim} period={period} periodValue={periodValue} forceReason={forceReason} />

        <div style={{ display: 'flex' }}>
          <div className="min-w-0" style={{ flex: 1, padding: '18px 24px 22px', borderRight: '1px solid var(--nm-border-hair)' }}>
            <MainHeading periodLabel={periodLabel} dimLabel={dimMeta.label} equals={dimMeta.equals} humanCostNote={dim === 'site' ? '只含直接成本,不含人力' : '不含人力成本'} />

            {loadError ? (
              <div className="rounded-2xl px-4 py-3 text-[13px]" style={{ background: 'rgba(224,122,122,0.08)', border: '1px solid rgba(224,122,122,0.34)', color: 'var(--nm-danger-glass-text)' }}>
                讀取失敗({loadError.area}),以下數字不可信:{loadError.message}
              </div>
            ) : dim === 'category' && categoryData ? (
              categoryData.rows.length === 0 ? (
                <EmptyPeriod />
              ) : (
                <ReportsCategoryTable stmt={categoryData.stmt} prevStmt={categoryData.prevStmt} drillHref={drillHrefFor} />
              )
            ) : dim === 'site' && siteData?.report ? (
              <ReportsSiteTable report={siteData.report} drillHref={drillHrefFor} />
            ) : (
              <NotImplementedDimension label={dimMeta.label} />
            )}

            {drawer && (
              <ReportsDrillDrawer
                title={drawer.title}
                count={drawer.count}
                total={drawer.total}
                rows={drawer.rows}
                seeAllHref={drawer.seeAllHref}
                collapseHref={buildHref(base, { drill: undefined })}
              />
            )}
          </div>

          <div className="no-print" style={{ flex: 'none', width: 352, padding: '18px 24px 22px' }}>
            <ReportsSidebar
              settledIncome={settledIncome}
              settledExpense={settledExpense}
              unsettledIncome={unsettledIncome}
              unsettledExpense={unsettledExpense}
              humanCostNote={humanCostNote}
              exportDisabledReason={exportDisabledReason}
            />
          </div>
        </div>
      </div>

      {/* 列印模板(Q3:分離)——同一份資料、另一個輸出樣板,不是把上面深色畫面硬印出來。 */}
      <div className="report-print-area print-only">
        <PrintDocument
          periodLabel={periodLabel}
          dimLabel={dimMeta.label}
          equals={dimMeta.equals}
          humanCostNote={dim === 'site' ? '只含直接成本,不含人力' : '不含人力成本'}
          categoryData={dim === 'category' ? categoryData : null}
          siteReport={dim === 'site' ? (siteData?.report ?? null) : null}
          settledIncome={settledIncome}
          settledExpense={settledExpense}
          unsettledIncome={unsettledIncome}
          unsettledExpense={unsettledExpense}
        />
      </div>
    </div>
  );
}

// ---------- 期間範圍 ----------

function periodRangeFor(period: PeriodType, value: string): { from: string; to: string; label: string } | null {
  if (period === 'month') return monthRangeLabeled(value);
  if (period === 'quarter' || period === 'year') return reportPeriodRange(period, value);
  if (period === 'tax') return { ...taxPeriodRange(value), label: taxPeriodLabel(value) };
  if (period === 'custom') return monthRangeLabeled(value || currentMonth()); // 尚未做日期選擇器,見下方註記
  return null; // 'project':整案期,不吃日期範圍
}

function monthRangeLabeled(value: string): { from: string; to: string; label: string } {
  const { from, to } = monthRange(value);
  return { from, to, label: value };
}

function periodDisplayLabel(period: PeriodType, value: string): string {
  if (period === 'project') return '整案期';
  if (period === 'tax') return taxPeriodLabel(value);
  if (period === 'custom') return `${value}(自訂期間的日期選擇器尚未實作,暫以當月代替)`;
  return periodRangeFor(period, value)?.label ?? value;
}

// ---------- 資料載入 ----------

async function loadCategory(sb: ReturnType<typeof getSupabaseAdmin>, range: { from: string; to: string }) {
  const prevRange = shiftRangeBack(range);
  const [curRes, prevRes] = await Promise.all([
    sb.from('ledger_entries').select('kind, direction, amount_twd, fee_twd').eq('state', 'posted').gte('occurred_on', range.from).lte('occurred_on', range.to),
    sb.from('ledger_entries').select('kind, direction, amount_twd, fee_twd').eq('state', 'posted').gte('occurred_on', prevRange.from).lte('occurred_on', prevRange.to),
  ]);
  const error = curRes.error?.message ?? prevRes.error?.message ?? null;
  const rows = (curRes.data ?? []) as ReportEntryRow[];
  const prevRows = (prevRes.data ?? []) as ReportEntryRow[];
  return {
    error,
    rows,
    stmt: buildIncomeStatement(rows),
    // 沒有上期可比(例如資料庫裡完全沒有更早的分錄)時回傳 null,呼叫端顯示 —,
    // 不顯示 0% 或 +100%(九種狀態之一)。這裡簡化為「上期完全沒有任何分錄」判定。
    prevStmt: prevRows.length > 0 ? buildIncomeStatement(prevRows) : null,
  };
}

// 上一期的日期範圍——用天數差近似整月/整季/整年平移一次,不做曆法精算
// (報表口徑本來就是月/季/年邊界對齊,不需要處理閏年以外的邊界情況)。
function shiftRangeBack(range: { from: string; to: string }): { from: string; to: string } {
  const from = new Date(range.from + 'T00:00:00Z');
  const to = new Date(range.to + 'T00:00:00Z');
  const days = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
  const prevTo = new Date(from.getTime() - 86400000);
  const prevFrom = new Date(prevTo.getTime() - (days - 1) * 86400000);
  const fmtD = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmtD(prevFrom), to: fmtD(prevTo) };
}

interface DrawerResult {
  title: string;
  count: number;
  total: number;
  rows: DrillRow[];
  seeAllHref: string;
}

async function loadDrawer(
  sb: ReturnType<typeof getSupabaseAdmin>,
  dim: Dimension,
  drillKey: string,
  range: { from: string; to: string; label: string } | null,
  base: SP,
): Promise<DrawerResult | null> {
  if (dim === 'category') {
    if (!range) return null;
    const { data, error } = await sb.from('ledger_entries').select('*, sites(name)').eq('state', 'posted').eq('kind', drillKey)
      .gte('occurred_on', range.from).lte('occurred_on', range.to).order('occurred_on', { ascending: false });
    if (error) return { title: drillKey, count: 0, total: 0, rows: [], seeAllHref: '#' };
    const all = (data ?? []) as Array<{ occurred_on: string; party: string | null; amount_twd: number; direction: string; sites?: { name: string } | null }>;
    const total = all.reduce((s, r) => s + (r.direction === 'expense' ? -r.amount_twd : r.amount_twd), 0);
    return {
      title: drillKey,
      count: all.length,
      total,
      rows: all.slice(0, 3).map((r) => ({ occurred_on: r.occurred_on, party: r.party, siteName: r.sites?.name ?? null, amount_twd: r.direction === 'expense' ? -r.amount_twd : r.amount_twd })),
      seeAllHref: buildHref(base, { mode: 'settled', kind: drillKey, month: 'all', drill: undefined }),
    };
  }
  if (dim === 'site') {
    const isResidual = drillKey === NO_SITE;
    let q = sb.from('ledger_entries').select('*, sites(name)').eq('state', 'posted');
    q = isResidual ? q.is('site_id', null) : q.eq('site_id', drillKey);
    const { data, error } = await q.order('occurred_on', { ascending: false });
    if (error) return { title: drillKey, count: 0, total: 0, rows: [], seeAllHref: '#' };
    const all = (data ?? []) as Array<{ occurred_on: string; party: string | null; amount_twd: number; direction: string; sites?: { name: string } | null }>;
    const total = all.reduce((s, r) => s + (r.direction === 'expense' ? -r.amount_twd : r.amount_twd), 0);
    return {
      title: isResidual ? '未歸類' : (all[0]?.sites?.name ?? '案子'),
      count: all.length,
      total,
      rows: all.slice(0, 3).map((r) => ({ occurred_on: r.occurred_on, party: r.party, siteName: r.sites?.name ?? null, amount_twd: r.direction === 'expense' ? -r.amount_twd : r.amount_twd })),
      seeAllHref: isResidual ? buildHref(base, { mode: 'settled', month: 'all', drill: undefined }) : buildHref(base, { mode: 'settled', site_id: drillKey, month: 'all', drill: undefined }),
    };
  }
  return null;
}

// ---------- 展示用小元件 ----------

function ReportKnobs({ base, dim, period, periodValue, forceReason }: {
  base: SP; dim: Dimension; period: PeriodType; periodValue: string; forceReason: string | null;
}) {
  const segStyle = (active: boolean, disabled: boolean): React.CSSProperties => ({
    padding: '7px 13px', borderRadius: 8, font: '400 12.5px/1 inherit',
    background: active ? '#f0f0f2' : 'transparent',
    color: active ? '#17171a' : disabled ? '#4a4b50' : 'var(--nm-text-muted)',
    fontWeight: active ? 500 : 400,
    pointerEvents: disabled ? 'none' : undefined,
    textDecoration: 'none', display: 'inline-block',
  });
  return (
    <div className="no-print" data-knob="period" style={{ padding: '14px 28px', background: 'rgba(8,8,10,.28)', display: 'flex', alignItems: 'center', gap: 16, borderBottom: '1px solid var(--nm-border-hair)', flexWrap: 'wrap' }}>
      <span style={{ width: 74, font: '400 10.5px/1 inherit', letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--nm-text-muted)' }}>期間</span>
      <div className="nm-inset" style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 12 }}>
        {PERIOD_OPTIONS.map((opt) => {
          const disabled = isPeriodDisabledForDimension(dim, opt.key);
          const active = opt.key === period;
          const href = disabled ? undefined : buildHref(base, { dim, period: opt.key, pv: currentPeriodValue(opt.key), drill: undefined });
          return href
            ? <a key={opt.key} href={href} data-opt data-active={active ? true : undefined} style={segStyle(active, false)}>{opt.label}</a>
            : <span key={opt.key} data-opt data-disabled style={segStyle(active, true)}>{opt.label}</span>;
        })}
      </div>
      {forceReason && <span style={{ font: '400 11.5px/1.5 inherit', color: 'var(--nm-warning-glass-text)', maxWidth: 340 }}>{forceReason}</span>}
      {!forceReason && period !== 'project' && period !== 'tax' && (
        <PeriodStepper base={base} dim={dim} period={period} periodValue={periodValue} />
      )}
      <DimensionRow base={base} dim={dim} activePeriod={period} />
    </div>
  );
}

function PeriodStepper({ base, dim, period, periodValue }: { base: SP; dim: Dimension; period: PeriodType; periodValue: string }) {
  const prev = period === 'year' ? String(Number(periodValue) - 1) : period === 'quarter' ? shiftQuarter(periodValue, -1) : shiftMonth(periodValue, -1);
  const next = period === 'year' ? String(Number(periodValue) + 1) : period === 'quarter' ? shiftQuarter(periodValue, 1) : shiftMonth(periodValue, 1);
  const cur = period === 'year' ? currentYear() : period === 'quarter' ? currentQuarter() : currentMonth();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
      <a href={buildHref(base, { dim, period, pv: prev, drill: undefined })} className="nm-btn" style={{ padding: '4px 10px', minHeight: 'auto', fontSize: 12.5 }}>← 上期</a>
      <span style={{ font: '500 12.5px/1 inherit', color: 'var(--nm-text-primary)', minWidth: '5rem', textAlign: 'center' }}>{periodValue}</span>
      <a href={buildHref(base, { dim, period, pv: next, drill: undefined })} className="nm-btn" style={{ padding: '4px 10px', minHeight: 'auto', fontSize: 12.5 }}>下期 →</a>
      {periodValue !== cur && (
        <a href={buildHref(base, { dim, period, pv: cur, drill: undefined })} style={{ font: '400 11.5px/1 inherit', color: 'var(--nm-text-muted)', textDecoration: 'underline' }}>回本期</a>
      )}
    </div>
  );
}

function DimensionRow({ base, dim, activePeriod }: { base: SP; dim: Dimension; activePeriod: PeriodType }) {
  return (
    <div className="no-print" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 16, paddingTop: 10, marginTop: 4, borderTop: '1px solid rgba(255,255,255,.07)' }}>
      <span style={{ width: 74, font: '400 10.5px/1 inherit', letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--nm-text-muted)' }}>維度</span>
      <div className="nm-inset" style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 12 }}>
        {DIMENSION_OPTIONS.map((opt) => {
          const active = opt.key === dim;
          // 切維度時盡量保留目前的期間類型(合法就沿用,不合法才退回該維度的預設)——
          // 只有在維度真的強制期間(site→整案期／books→稅務期)時才會改變,並且會顯示原因。
          const { period: forcedPeriod } = resolvePeriodForDimension(opt.key, activePeriod);
          const href = buildHref(base, { dim: opt.key, period: forcedPeriod, pv: currentPeriodValue(forcedPeriod), drill: undefined });
          return (
            <a key={opt.key} href={href} data-opt data-active={active ? true : undefined}
              style={{ padding: '7px 13px', borderRadius: 8, font: '400 12.5px/1 inherit', background: active ? '#f0f0f2' : 'transparent', color: active ? '#17171a' : 'var(--nm-text-muted)', fontWeight: active ? 500 : 400, textDecoration: 'none', display: 'inline-block' }}
            >{opt.label}</a>
          );
        })}
      </div>
    </div>
  );
}

function MainHeading({ periodLabel, dimLabel, equals, humanCostNote }: { periodLabel: string; dimLabel: string; equals: string; humanCostNote: string }) {
  return (
    <div style={{ marginBottom: 14 }} data-basis>
      <div style={{ font: '600 16px/1 inherit', color: 'var(--nm-text-primary)' }}>{periodLabel}　·　{dimLabel}</div>
      <div style={{ font: '400 11.5px/1 inherit', color: 'var(--nm-text-muted)', marginTop: 4 }}>＝ {equals}</div>
      <div style={{ font: '400 11.5px/1.6 inherit', color: 'var(--nm-text-secondary)', marginTop: 6 }}>
        口徑:現金收付制　·　已扣手續費　·　不含未收未付　·　<span style={{ color: 'var(--nm-warning-glass-text)' }}>{humanCostNote}</span>
      </div>
    </div>
  );
}

function EmptyPeriod() {
  return <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--nm-text-faint)', fontSize: 13 }}>這段期間沒有帳目</div>;
}

function NotImplementedDimension({ label }: { label: string }) {
  return (
    <div className="rounded-2xl px-4 py-3 text-[13px]" style={{ background: 'rgba(20,20,24,0.5)', border: '1px solid var(--nm-border-hair)', color: 'var(--nm-text-secondary)' }}>
      「{label}」維度的資料查詢下一輪加入(17-reports-center.md 定案的五個 commit 目前只涵蓋按類別／按案子)。旋鈕與側欄先行,避免假裝有資料。
    </div>
  );
}

// ---------- 列印模板(Q3 分離) ----------

function PrintDocument({
  periodLabel, dimLabel, equals, humanCostNote, categoryData, siteReport,
  settledIncome, settledExpense, unsettledIncome, unsettledExpense,
}: {
  periodLabel: string; dimLabel: string; equals: string; humanCostNote: string;
  categoryData: Awaited<ReturnType<typeof loadCategory>> | null;
  siteReport: Awaited<ReturnType<typeof buildSiteReport>>['report'] | null;
  settledIncome: number; settledExpense: number; unsettledIncome: number; unsettledExpense: number;
}) {
  const printedAt = new Date().toISOString().slice(0, 16).replace('T', ' ');
  return (
    <div style={{ background: '#fff', color: '#17171a', padding: '32px 40px', maxWidth: 900, margin: '0 auto', fontSize: 13 }}>
      <div style={{ textAlign: 'center', marginBottom: 18 }}>
        <div style={{ fontSize: 18, fontWeight: 600 }}>聲生工作系統 · 報表中心</div>
        <div style={{ fontSize: 13, color: '#555', marginTop: 4 }}>{periodLabel}　·　{dimLabel}(＝{equals})</div>
      </div>
      <div style={{ fontSize: 11.5, color: '#555', marginBottom: 16, lineHeight: 1.6 }}>
        口徑:現金收付制　·　已扣手續費　·　不含未收未付　·　{humanCostNote}
      </div>

      {categoryData && (
        <PrintCategoryTable stmt={categoryData.stmt} />
      )}
      {siteReport && (
        <PrintSiteTable report={siteReport} />
      )}

      <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid #ccc', fontSize: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>已收付 vs 未收付(本月)</div>
        <div>已收(本期):${fmt(settledIncome)}　　應收未收(在手):${fmt(unsettledIncome)}</div>
        <div>已付(本期):${fmt(settledExpense)}　　應付未付(在手):${fmt(unsettledExpense)}</div>
      </div>

      <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: '#888', borderTop: '1px solid #ccc', paddingTop: 8 }}>
        <span>列印時間:{printedAt}</span>
        <span>第 1 頁</span>
      </div>
    </div>
  );
}

function PrintCategoryTable({ stmt }: { stmt: ReturnType<typeof buildIncomeStatement> }) {
  const row = (label: string, value: number, bold?: boolean) => (
    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #eee', fontWeight: bold ? 600 : 400 }}>
      <span>{label}</span><span>${fmt(value)}</span>
    </div>
  );
  return (
    <div>
      {stmt.operatingIncomeRows.map((r) => row(r.label, r.amount))}
      {row('營業收入合計', stmt.operatingIncomeTotal, true)}
      {stmt.operatingExpenseRows.map((r) => row(r.label, -r.amount))}
      {row('轉帳手續費', -stmt.feeTotal)}
      {row('營業損益', stmt.operatingNet, true)}
      {row('本期淨額', stmt.net, true)}
    </div>
  );
}

function PrintSiteTable({ report }: { report: NonNullable<Awaited<ReturnType<typeof buildSiteReport>>['report']> }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ borderBottom: '1px solid #999' }}>
          <th style={{ textAlign: 'left', padding: '4px 0' }}>案子</th>
          <th style={{ textAlign: 'right', padding: '4px 0' }}>收入</th>
          <th style={{ textAlign: 'right', padding: '4px 0' }}>直接成本</th>
          <th style={{ textAlign: 'right', padding: '4px 0' }}>代墊</th>
          <th style={{ textAlign: 'right', padding: '4px 0' }}>毛利</th>
        </tr>
      </thead>
      <tbody>
        {[...report.rows, ...(report.residual ? [report.residual] : [])].map((r) => (
          <tr key={r.siteId ?? 'residual'} style={{ borderBottom: '1px solid #eee' }}>
            <td style={{ padding: '4px 0' }}>{r.label}</td>
            <td style={{ textAlign: 'right' }}>${fmt(r.revenue)}</td>
            <td style={{ textAlign: 'right' }}>${fmt(r.directCost)}</td>
            <td style={{ textAlign: 'right' }}>${fmt(r.advance)}</td>
            <td style={{ textAlign: 'right', fontWeight: 600 }}>${fmt(r.margin)}</td>
          </tr>
        ))}
        <tr style={{ fontWeight: 600, borderTop: '1px solid #999' }}>
          <td style={{ padding: '6px 0' }}>合計</td>
          <td style={{ textAlign: 'right' }}>${fmt(report.total.revenue)}</td>
          <td style={{ textAlign: 'right' }}>${fmt(report.total.directCost)}</td>
          <td style={{ textAlign: 'right' }}>${fmt(report.total.advance)}</td>
          <td style={{ textAlign: 'right' }}>${fmt(report.total.margin)}</td>
        </tr>
      </tbody>
    </table>
  );
}
