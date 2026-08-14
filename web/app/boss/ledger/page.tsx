import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/supabase';
import { LEDGER_KIND_LABEL, INVOICE_STATUS_LABEL, type LedgerKind, type InvoiceStatus } from '@/lib/types';
import ImportBatchDialog from './ImportBatchDialog';
import ExportCsvDialog from './ExportCsvDialog';
import { AllView } from './AllView';
import { SettledView, ReceivablesView } from './SettledReceivablesViews';
import { FilterDrawer } from './FilterDrawer';
import { buildHref, currentMonth, shiftMonth, NO_SITE, type Mode, type SP } from './ledger-page-helpers';

export const dynamic = 'force-dynamic';

const ALL_KINDS = Object.keys(LEDGER_KIND_LABEL) as LedgerKind[];

export default async function LedgerHomePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = (await searchParams) ?? {};
  const mode: Mode = sp.mode === 'receivable' || sp.mode === 'payable' || sp.mode === 'settled' ? sp.mode : 'all';
  const month = sp.month === 'all' || (sp.month && /^\d{4}-\d{2}$/.test(sp.month)) ? sp.month! : currentMonth();
  const siteId = sp.site_id;
  const kind = sp.kind && ALL_KINDS.includes(sp.kind as LedgerKind) ? (sp.kind as LedgerKind) : undefined;
  const invoice = sp.invoice && sp.invoice in INVOICE_STATUS_LABEL ? (sp.invoice as InvoiceStatus) : undefined;
  const toCheckOnly = sp.to_check === '1';
  const ext = sp.ext === 'internal' || sp.ext === 'external' ? sp.ext : undefined;
  const showVoided = sp.show_voided === '1';

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

  const base: SP = { month, mode, site_id: siteId, kind, invoice, to_check: toCheckOnly ? '1' : undefined, ext, show_voided: showVoided ? '1' : undefined };
  const siteName = siteId && siteId !== NO_SITE ? sites.find((s) => s.id === siteId)?.name ?? null : null;
  const activeFilterLabels = [
    siteId ? (siteId === NO_SITE ? '專案外' : '歸屬') : null,
    kind ? '分類' : null,
    invoice ? '發票' : null,
    ext ? (ext === 'internal' ? '內帳' : '外帳') : null,
  ].filter((x): x is string => x !== null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--nm-text-primary)' }}>帳務</h1>
        <div className="flex items-center gap-2">
          {(mode === 'settled' || mode === 'all') && (
            <div className="flex items-center gap-2 text-[13px]">
              <Link href={buildHref(base, { month: shiftMonth(month === 'all' ? currentMonth() : month, -1) })} className="nm-btn" style={{ padding: '4px 10px', minHeight: 'auto' }}>← 上月</Link>
              <span className="font-semibold min-w-[6rem] text-center" style={{ color: 'var(--nm-text-primary)' }}>
                {month === 'all' ? '不限月份' : month}
              </span>
              <Link href={buildHref(base, { month: shiftMonth(month === 'all' ? currentMonth() : month, 1) })} className="nm-btn" style={{ padding: '4px 10px', minHeight: 'auto' }}>下月 →</Link>
              {month !== currentMonth() && (
                <Link href={buildHref(base, { month: currentMonth() })} className="underline" style={{ color: 'var(--nm-text-muted)', padding: '4px 8px' }}>回本月</Link>
              )}
            </div>
          )}
          <Link href={`/boss/ledger/new?month=${month === 'all' ? currentMonth() : month}`} className="nm-btn-solid text-[13px]">記一筆</Link>
        </div>
      </div>

      {/* 待處理:桌機是一行黃字摘要(取代原本一整排pill);手機維持pill——兩個斷點的
          原型(7a／2b)本來就不同待遇,不是同一份東西縮放。手機橫向可捲動,不擠壓換行。 */}
      {(toIssueCount > 0 || toCheckCount > 0 || overpaidCount > 0) && (
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
        </div>
      )}

      {/* 模式切換:一顆軌道裡的分段(nm-inset track),不是四顆各自帶邊框的按鈕——
          照抄原型 7a 的 inline style。手機橫向可捲動,不擠壓換行。 */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="nm-inset flex gap-1.5 text-[13px] flex-nowrap overflow-x-auto" style={{ borderRadius: 999, padding: 4, color: 'var(--nm-text-secondary)' }}>
          {([
            ['all', '全部'],
            ['settled', '已收付'],
            ['receivable', '應收未收'],
            ['payable', '應付未付'],
          ] as const).map(([m, label]) => (
            <Link
              key={m}
              href={buildHref(base, { mode: m })}
              className="shrink-0"
              style={
                mode === m
                  ? { borderRadius: 999, padding: '6px 14px', background: '#f0f0f2', color: '#17171a', fontWeight: 500 }
                  : { borderRadius: 999, padding: '6px 14px' }
              }
            >{label}</Link>
          ))}
        </div>

        {(toIssueCount > 0 || toCheckCount > 0 || overpaidCount > 0) && (
          <div className="hidden lg:block text-[12.5px]" style={{ color: 'var(--nm-warning-glass-text)' }}>
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

      {/* 歸屬篩選:專案內(選特定案場)/ 專案外(依分類)/ 全部——兩種模式共用同一個案場篩選。
          桌機常駐橫排;手機收進☰抽屜(規格明講,原型 2b 也是這樣)——同一份欄位在
          兩個斷點各自一份 <form method="get">,無 JS 也能用,跟本頁其他區塊的
          手機/桌機雙份 markup 慣例一致。 */}
      <div className="flex flex-wrap items-center gap-3">
        <form action="/boss/ledger" method="get" className="hidden lg:flex flex-nowrap overflow-x-auto items-center gap-2 text-[13px] pb-1">
          <input type="hidden" name="mode" value={mode} />
          {month !== currentMonth() && <input type="hidden" name="month" value={month} />}
          <select name="site_id" defaultValue={siteId ?? ''} className="nm-input shrink-0" style={{ width: 'auto', minHeight: 34, padding: '4px 10px' }}>
            <option value="">歸屬:全部</option>
            <option value={NO_SITE}>— 專案外 —</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {(mode === 'settled' || mode === 'all') && (
            <>
              <select name="kind" defaultValue={kind ?? ''} className="nm-input shrink-0" style={{ width: 'auto', minHeight: 34, padding: '4px 10px' }}>
                <option value="">分類:全部</option>
                {ALL_KINDS.map((k) => <option key={k} value={k}>{LEDGER_KIND_LABEL[k]}</option>)}
              </select>
              <select name="invoice" defaultValue={invoice ?? ''} className="nm-input shrink-0" style={{ width: 'auto', minHeight: 34, padding: '4px 10px' }}>
                <option value="">發票:全部</option>
                <option value="none">不列外帳</option>
                <option value="to_issue">待開立</option>
                <option value="issued">已開立</option>
              </select>
              <select name="ext" defaultValue={ext ?? ''} className="nm-input shrink-0" style={{ width: 'auto', minHeight: 34, padding: '4px 10px' }}>
                <option value="">內外帳:全部</option>
                <option value="internal">內帳</option>
                <option value="external">外帳</option>
              </select>
            </>
          )}
          <button type="submit" className="nm-btn shrink-0" style={{ padding: '4px 14px', minHeight: 'auto' }}>套用</button>
        </form>

        <FilterDrawer activeCount={activeFilterLabels.length} activeSummary={activeFilterLabels.join('・')}>
          <form action="/boss/ledger" method="get" className="flex flex-col gap-3 text-[13px]">
            <input type="hidden" name="mode" value={mode} />
            {month !== currentMonth() && <input type="hidden" name="month" value={month} />}
            <label className="flex flex-col gap-1">
              <span style={{ color: 'var(--nm-text-secondary)' }}>歸屬</span>
              <select name="site_id" defaultValue={siteId ?? ''} className="nm-input">
                <option value="">全部</option>
                <option value={NO_SITE}>— 專案外 —</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            {(mode === 'settled' || mode === 'all') && (
              <>
                <label className="flex flex-col gap-1">
                  <span style={{ color: 'var(--nm-text-secondary)' }}>分類</span>
                  <select name="kind" defaultValue={kind ?? ''} className="nm-input">
                    <option value="">全部</option>
                    {ALL_KINDS.map((k) => <option key={k} value={k}>{LEDGER_KIND_LABEL[k]}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span style={{ color: 'var(--nm-text-secondary)' }}>發票</span>
                  <select name="invoice" defaultValue={invoice ?? ''} className="nm-input">
                    <option value="">全部</option>
                    <option value="none">不列外帳</option>
                    <option value="to_issue">待開立</option>
                    <option value="issued">已開立</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span style={{ color: 'var(--nm-text-secondary)' }}>內外帳</span>
                  <select name="ext" defaultValue={ext ?? ''} className="nm-input">
                    <option value="">全部</option>
                    <option value="internal">內帳</option>
                    <option value="external">外帳</option>
                  </select>
                </label>
              </>
            )}
            <button type="submit" className="nm-btn-solid mt-2">套用</button>
          </form>
        </FilterDrawer>

        {(siteId || kind || invoice || ext || toCheckOnly) && (
          <Link href={buildHref(base, { site_id: undefined, kind: undefined, invoice: undefined, ext: undefined, to_check: undefined })} className="text-[13px] underline" style={{ color: 'var(--nm-text-muted)' }}>
            清除篩選
          </Link>
        )}
      </div>

      {siteId && (
        <div className="rounded-xl px-3 py-2 text-[13px] flex items-center gap-2" style={{ background: 'rgba(126,207,157,0.08)', border: '1px solid rgba(126,207,157,0.26)', color: 'var(--nm-success-glass-text)' }}>
          {siteId === NO_SITE ? '篩選中:專案外的項目' : `篩選中:專案「${siteName ?? '?'}」`}
        </div>
      )}
      {toCheckOnly && (
        <div className="rounded-xl px-3 py-2 text-[13px] flex items-center gap-2" style={{ background: 'rgba(217,181,107,0.09)', border: '1px solid rgba(217,181,107,0.3)', color: 'var(--nm-warning-glass-text)' }}>
          篩選中:只顯示「AI 沒把握 / 待確認」的帳目
          <Link href={buildHref(base, { to_check: undefined })} className="underline ml-auto" style={{ color: 'var(--nm-text-muted)' }}>清除</Link>
        </div>
      )}

      {mode === 'all' && (
        <AllView sb={sb} month={month} siteId={siteId} kind={kind} invoice={invoice} toCheckOnly={toCheckOnly} ext={ext} base={base} toCheckCount={toCheckCount} toIssueCount={toIssueCount} />
      )}
      {mode === 'settled' && (
        <SettledView sb={sb} month={month} siteId={siteId} kind={kind} invoice={invoice} toCheckOnly={toCheckOnly} ext={ext} showVoided={showVoided} base={base} />
      )}
      {(mode === 'receivable' || mode === 'payable') && (
        <ReceivablesView sb={sb} direction={mode === 'receivable' ? 'receivable' : 'payable'} siteId={siteId} />
      )}

      <div className="flex flex-wrap gap-3 items-center pt-2">
        <ImportBatchDialog />
        {(mode === 'settled' || mode === 'all') && <ExportCsvDialog defaultMonth={month === 'all' ? currentMonth() : month} />}
      </div>
    </div>
  );
}
