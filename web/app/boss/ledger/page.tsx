import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/supabase';
import { LEDGER_KIND_LABEL, INVOICE_STATUS_LABEL, type LedgerKind, type InvoiceStatus } from '@/lib/types';
import { DashboardView } from './DashboardView';
import { SettledView, ReceivablesView } from './SettledReceivablesViews';
import { PayrollView } from './PayrollView';
import { ReportsView } from './ReportsView';
import { LedgerTabSwiper, type LedgerTab } from './LedgerTabSwiper';
import { buildHref, currentMonth, currentQuarter, currentYear, type Mode, type ReportPeriodType, type SP } from './ledger-page-helpers';
import { requirePageCapability } from '@/lib/require-capability';

export const dynamic = 'force-dynamic';

export default async function LedgerHomePage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePageCapability('finance');
  const sp = (await searchParams) ?? {};
  const mode: Mode = sp.mode === 'receivable' || sp.mode === 'payable' || sp.mode === 'settled' || sp.mode === 'payroll' || sp.mode === 'reports' ? sp.mode : 'all';
  // 五個分頁現在同時掛載、滑動切換不導頁,不能再靠「目前是哪個 mode」決定
  // 月份要不要正規化——每個分頁各自把共用的 ?month= 收斂到自己合法的範圍:
  // 已收付可以是「不限月份」,月結永遠要是一個真實月份。
  const settledMonth = sp.month === 'all' || (sp.month && /^\d{4}-\d{2}$/.test(sp.month)) ? sp.month! : currentMonth();
  const payrollMonth = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : currentMonth();
  const siteId = sp.site_id;
  const kind = sp.kind && sp.kind in LEDGER_KIND_LABEL ? (sp.kind as LedgerKind) : undefined;
  const invoice = sp.invoice && sp.invoice in INVOICE_STATUS_LABEL ? (sp.invoice as InvoiceStatus) : undefined;
  const toCheckOnly = sp.to_check === '1';
  const ext = sp.ext === 'internal' || sp.ext === 'external' ? sp.ext : undefined;
  const showVoided = sp.show_voided === '1';
  const reportPeriod: ReportPeriodType = sp.rp === 'quarter' || sp.rp === 'year' ? sp.rp : 'month';
  const reportValueValid = sp.rv && (
    reportPeriod === 'month' ? /^\d{4}-\d{2}$/.test(sp.rv)
      : reportPeriod === 'quarter' ? /^\d{4}-Q[1-4]$/.test(sp.rv)
        : /^\d{4}$/.test(sp.rv)
  );
  const reportValue = reportValueValid
    ? sp.rv!
    : (reportPeriod === 'month' ? currentMonth() : reportPeriod === 'quarter' ? currentQuarter() : currentYear());

  const sb = getSupabaseAdmin();

  const [sitesRes, pendingRes] = await Promise.all([
    sb.from('sites').select('id, name').eq('active', true).order('name'),
    // 待處理提示:三項全部不限月份,回答的是「現在有什麼事要做」,不是「這個月」。
    Promise.all([
      sb.from('ledger_entries').select('id', { count: 'exact', head: true }).eq('invoice_status', 'to_issue').neq('state', 'voided'),
      sb.from('ledger_entries').select('id', { count: 'exact', head: true }).eq('to_check', true).neq('state', 'voided'),
      sb.from('receivable_payment_state').select('direction', { count: 'exact', head: true }).eq('status', 'open').eq('overpaid', true),
      sb.from('expenses').select('id', { count: 'exact', head: true }).eq('status', 'submitted'),
    ]),
  ]);
  const sites = (sitesRes.data ?? []) as Array<{ id: string; name: string }>;
  const [toIssueRes, toCheckRes, overpaidRes, pettycashRes] = pendingRes;
  const toIssueCount = toIssueRes.count ?? 0;
  const toCheckCount = toCheckRes.count ?? 0;
  const overpaidCount = overpaidRes.count ?? 0;
  const pettycashCount = pettycashRes.count ?? 0;

  const base: SP = { month: settledMonth, mode, site_id: siteId, kind, invoice, to_check: toCheckOnly ? '1' : undefined, ext, show_voided: showVoided ? '1' : undefined, rp: reportPeriod, rv: reportValue };
  // 分頁現在滑動切換、不導頁——伺服器只在「真的導頁那一刻」算過一次 mode,
  // 一個分頁自己的月份/篩選連結不能沿用那個共用 base.mode,不然滑到別分頁後
  // 點裡面的連結(上月、顯示已作廢…)會把 mode 導回原本進來時的那一頁。
  // 每個分頁拿到的 base 都先把 mode 釘死成「自己」,分頁內部完全不用管這件事。
  const baseFor = (m: Mode): SP => ({ ...base, mode: m });

  // 六個分頁的內容一次全部算好——滑動切換才能真正零等待,不用等一次新的請求。
  const tabs: LedgerTab[] = [
    { key: 'all', label: '金流監測', href: buildHref(base, { mode: 'all' }), node: <DashboardView sb={sb} toCheckCount={toCheckCount} toIssueCount={toIssueCount} /> },
    { key: 'settled', label: '已收付', href: buildHref(base, { mode: 'settled' }), node: <SettledView sb={sb} month={settledMonth} siteId={siteId} kind={kind} invoice={invoice} toCheckOnly={toCheckOnly} ext={ext} showVoided={showVoided} base={baseFor('settled')} sites={sites} /> },
    { key: 'receivable', label: '應收款', href: buildHref(base, { mode: 'receivable' }), node: <ReceivablesView sb={sb} direction="receivable" siteId={siteId} sites={sites} base={baseFor('receivable')} month={settledMonth} /> },
    { key: 'payable', label: '應付款', href: buildHref(base, { mode: 'payable' }), node: <ReceivablesView sb={sb} direction="payable" siteId={siteId} sites={sites} base={baseFor('payable')} month={settledMonth} /> },
    { key: 'payroll', label: '月結', href: buildHref(base, { mode: 'payroll', month: payrollMonth }), node: <PayrollView sb={sb} month={payrollMonth} base={baseFor('payroll')} /> },
    { key: 'reports', label: '報表中心', href: buildHref(base, { mode: 'reports' }), node: <ReportsView sb={sb} base={baseFor('reports')} rp={reportPeriod} rv={reportValue} /> },
  ];

  return (
    <div className="lg:h-full lg:flex lg:flex-col gap-4 space-y-4 lg:space-y-0">
      {/* 待處理:桌機是一行黃字摘要(取代原本一整排pill);手機維持pill——兩個斷點的
          原型(7a／2b)本來就不同待遇,不是同一份東西縮放。手機橫向可捲動,不擠壓換行。
          跟分頁無關,五個分頁都看得到,所以留在滑動軌道外面。 */}
      {(toIssueCount > 0 || toCheckCount > 0 || overpaidCount > 0 || pettycashCount > 0) && (
        <div className="shrink-0">
          <div className="lg:hidden flex flex-nowrap overflow-x-auto gap-1.5 text-[11.5px]">
            {toIssueCount > 0 && (
              <Link href={buildHref(base, { mode: 'settled', month: 'all', invoice: 'to_issue' })} className="nm-pill nm-pill-warning shrink-0">待開發票 {toIssueCount}</Link>
            )}
            {overpaidCount > 0 && (
              <Link href={buildHref(base, { mode: 'receivable' })} className="nm-pill nm-pill-danger shrink-0" style={{ fontWeight: 600 }}>超收 {overpaidCount}</Link>
            )}
            {toCheckCount > 0 && (
              <Link href={buildHref(base, { mode: 'settled', month: 'all', to_check: '1' })} className="nm-pill nm-pill-warning shrink-0">AI {toCheckCount}</Link>
            )}
            {pettycashCount > 0 && (
              <Link href="/boss/expenses" className="nm-pill shrink-0">{pettycashCount} 筆零用金待審</Link>
            )}
          </div>
          <div className="hidden lg:flex items-center gap-4">
            {(toIssueCount > 0 || toCheckCount > 0 || overpaidCount > 0) && (
              <div className="text-[12.5px]" style={{ color: 'var(--nm-warning-glass-text)' }}>
                {[
                  toIssueCount > 0 ? <Link key="issue" href={buildHref(base, { mode: 'settled', month: 'all', invoice: 'to_issue' })}>待開發票 {toIssueCount}</Link> : null,
                  toCheckCount > 0 ? <Link key="check" href={buildHref(base, { mode: 'settled', month: 'all', to_check: '1' })}>AI 待確認 {toCheckCount}</Link> : null,
                  overpaidCount > 0 ? <Link key="over" href={buildHref(base, { mode: 'receivable' })}>超收/超付 {overpaidCount}</Link> : null,
                ].filter(Boolean).reduce((acc: React.ReactNode[], el, i) => (i === 0 ? [el] : [...acc, '　·　', el]), [])}
              </div>
            )}
            {pettycashCount > 0 && (
              <Link href="/boss/expenses" className="nm-pill shrink-0">{pettycashCount} 筆零用金待審</Link>
            )}
          </div>
        </div>
      )}

      <LedgerTabSwiper
        tabs={tabs}
        activeKey={mode}
        trailing={<Link href={`/boss/ledger/new?month=${settledMonth === 'all' ? currentMonth() : settledMonth}`} className="nm-btn-solid text-[13px]">帳目記入</Link>}
      />
    </div>
  );
}
