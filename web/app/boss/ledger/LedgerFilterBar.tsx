import Link from 'next/link';
import { LEDGER_KIND_LABEL, type LedgerKind, type InvoiceStatus } from '@/lib/types';
import { FilterDrawer } from './FilterDrawer';
import { buildHref, currentMonth, NO_SITE, type SP } from './ledger-page-helpers';

const ALL_KINDS = Object.keys(LEDGER_KIND_LABEL) as LedgerKind[];

// 篩選列(歸屬/分類/發票/內外帳):抽成共用元件,因為 v2 把它從頁面頂部搬到
// 「全部」模式的月份列表區旁邊(只影響下方列表,監測帶永遠不篩選),但「已收付」
// 模式(mode=settled)沒有監測帶這個概念,篩選列還是留在頁面頂部——同一份 UI,
// 位置由呼叫端決定。
export function LedgerFilterBar({
  mode, month, siteId, kind, invoice, ext, sites, base, showKindInvoiceExt,
}: {
  mode: string;
  month: string;
  siteId?: string;
  kind?: LedgerKind;
  invoice?: InvoiceStatus;
  ext?: string;
  sites: Array<{ id: string; name: string }>;
  base: SP;
  showKindInvoiceExt: boolean;
}) {
  const activeFilterLabels = [
    siteId ? (siteId === NO_SITE ? '專案外' : '歸屬') : null,
    kind ? '分類' : null,
    invoice ? '發票' : null,
    ext ? (ext === 'internal' ? '內帳' : '外帳') : null,
  ].filter((x): x is string => x !== null);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <form action="/boss/ledger" method="get" className="hidden lg:flex flex-nowrap overflow-x-auto items-center gap-2 text-[13px] pb-1">
        <input type="hidden" name="mode" value={mode} />
        {month !== currentMonth() && <input type="hidden" name="month" value={month} />}
        <select name="site_id" defaultValue={siteId ?? ''} className="nm-input shrink-0" style={{ width: 'auto', minHeight: 34, padding: '4px 10px' }}>
          <option value="">歸屬:全部</option>
          <option value={NO_SITE}>— 專案外 —</option>
          {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {showKindInvoiceExt && (
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
          {showKindInvoiceExt && (
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

      {(siteId || kind || invoice || ext) && (
        <Link href={buildHref(base, { site_id: undefined, kind: undefined, invoice: undefined, ext: undefined })} className="text-[13px] underline" style={{ color: 'var(--nm-text-muted)' }}>
          清除篩選
        </Link>
      )}
    </div>
  );
}
