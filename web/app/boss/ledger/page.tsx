import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/supabase';
import {
  LEDGER_KIND_LABEL,
  INVOICE_STATUS_LABEL,
  RECEIVABLE_DIRECTION_LABEL,
  type LedgerEntry,
  type LedgerKind,
  type InvoiceStatus,
  type ReceivableDirection,
  type ReceivableStatus,
} from '@/lib/types';
import { summarizeEntries } from '@/lib/ledger-summary';
import { fetchReceivablesWithRemaining, summarizeReceivables, type ReceivableWithRemaining, type ReceivableSummaryRow } from '@/lib/receivables-query';
import { taipeiCurrentMonthStr } from '@/lib/tz';
import ImportBatchDialog from './ImportBatchDialog';
import ExportCsvDialog from './ExportCsvDialog';
import { VoidDialog } from './VoidDialog';
import LedgerRowMobile from './LedgerRowMobile';
import ReceivableForm from './receivables/ReceivableForm';
import StatusButtons from './receivables/StatusButtons';
import ReceivableRowMobile from './receivables/ReceivableRowMobile';

export const dynamic = 'force-dynamic';

type Mode = 'all' | 'settled' | 'receivable' | 'payable';
const NO_SITE = '__none__';

function currentMonth(): string {
  return taipeiCurrentMonthStr();
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const from = `${y}-${String(m).padStart(2, '0')}-01`;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const to = `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  return { from, to };
}

interface SP {
  month?: string; // YYYY-MM,或 'all'(不限月份,待處理提示點進來用)
  mode?: string;
  site_id?: string;
  kind?: string;
  invoice?: string;
  to_check?: string;
  ext?: string; // internal/external,不填=全部
  show_voided?: string;
}

function buildHref(base: SP, overrides: Partial<SP>): string {
  const p = new URLSearchParams();
  const merged: SP = { ...base, ...overrides };
  if (merged.month && merged.month !== currentMonth()) p.set('month', merged.month);
  if (merged.mode && merged.mode !== 'all') p.set('mode', merged.mode);
  if (merged.site_id) p.set('site_id', merged.site_id);
  if (merged.kind) p.set('kind', merged.kind);
  if (merged.invoice) p.set('invoice', merged.invoice);
  if (merged.to_check === '1') p.set('to_check', '1');
  if (merged.ext) p.set('ext', merged.ext);
  if (merged.show_voided === '1') p.set('show_voided', '1');
  const q = p.toString();
  return q ? `/boss/ledger?${q}` : '/boss/ledger';
}

const fmt = (n: number) => n.toLocaleString('zh-TW');
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--nm-text-primary)' }}>帳務</h1>
        <div className="flex gap-2">
          <Link href={`/boss/ledger/new?month=${month === 'all' ? currentMonth() : month}`} className="nm-btn-solid text-[13px]">記一筆</Link>
        </div>
      </div>

      {/* 待處理:全部不限月份,點了直接套對應篩選 */}
      {(toIssueCount > 0 || toCheckCount > 0 || overpaidCount > 0 || pettycashCount > 0) && (
        <div className="flex flex-wrap gap-2 text-[13px]">
          {toIssueCount > 0 && (
            <Link href={buildHref(base, { mode: 'settled', month: 'all', invoice: 'to_issue' })} className="nm-pill nm-pill-warning">
              {toIssueCount} 筆待開發票
            </Link>
          )}
          {toCheckCount > 0 && (
            <Link href={buildHref(base, { mode: 'settled', month: 'all', to_check: '1' })} className="nm-pill nm-pill-warning">
              {toCheckCount} 筆 AI 待確認
            </Link>
          )}
          {overpaidCount > 0 && (
            <Link href={buildHref(base, { mode: 'receivable' })} className="nm-pill" style={{ color: 'var(--nm-danger-glass-text)', background: 'rgba(224,122,122,0.1)', borderColor: 'rgba(224,122,122,0.3)' }}>
              {overpaidCount} 筆超收/超付
            </Link>
          )}
          {pettycashCount > 0 && (
            <Link href="/boss/expenses" className="nm-pill">
              {pettycashCount} 筆零用金待審
            </Link>
          )}
        </div>
      )}

      {/* 模式切換:全部(帳面)vs 已收付 vs 應收未收 vs 應付未付——已收跟未收永遠分開標,不相加成單一數字 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 text-[13px]">
          {([
            ['all', '全部'],
            ['settled', '已收付'],
            ['receivable', '應收未收'],
            ['payable', '應付未付'],
          ] as const).map(([m, label]) => (
            <Link
              key={m}
              href={buildHref(base, { mode: m })}
              className={mode === m ? 'nm-btn-solid' : 'nm-btn'}
              style={{ borderRadius: 999, padding: '4px 14px', minHeight: 'auto' }}
            >{label}</Link>
          ))}
        </div>

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
      </div>

      {/* 歸屬篩選:專案內(選特定案場)/ 專案外(依分類)/ 全部——兩種模式共用同一個案場篩選 */}
      <div className="flex flex-wrap items-center gap-3">
        <form action="/boss/ledger" method="get" className="flex flex-wrap items-center gap-2 text-[13px]">
          <input type="hidden" name="mode" value={mode} />
          {month !== currentMonth() && <input type="hidden" name="month" value={month} />}
          <select name="site_id" defaultValue={siteId ?? ''} className="nm-input" style={{ width: 'auto', minHeight: 34, padding: '4px 10px' }}>
            <option value="">歸屬:全部</option>
            <option value={NO_SITE}>— 專案外 —</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {(mode === 'settled' || mode === 'all') && (
            <>
              <select name="kind" defaultValue={kind ?? ''} className="nm-input" style={{ width: 'auto', minHeight: 34, padding: '4px 10px' }}>
                <option value="">分類:全部</option>
                {ALL_KINDS.map((k) => <option key={k} value={k}>{LEDGER_KIND_LABEL[k]}</option>)}
              </select>
              <select name="invoice" defaultValue={invoice ?? ''} className="nm-input" style={{ width: 'auto', minHeight: 34, padding: '4px 10px' }}>
                <option value="">發票:全部</option>
                <option value="none">不列外帳</option>
                <option value="to_issue">待開立</option>
                <option value="issued">已開立</option>
              </select>
              <select name="ext" defaultValue={ext ?? ''} className="nm-input" style={{ width: 'auto', minHeight: 34, padding: '4px 10px' }}>
                <option value="">內外帳:全部</option>
                <option value="internal">內帳</option>
                <option value="external">外帳</option>
              </select>
            </>
          )}
          <button type="submit" className="nm-btn" style={{ padding: '4px 14px', minHeight: 'auto' }}>套用</button>
        </form>
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
        <AllView sb={sb} month={month} siteId={siteId} kind={kind} invoice={invoice} toCheckOnly={toCheckOnly} ext={ext} base={base} />
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

interface RankRow { key: string; label: string; amount: number }

function rankTop3(map: Map<string, { label: string; amount: number }>): RankRow[] {
  const arr = Array.from(map.entries())
    .map(([key, v]) => ({ key, ...v }))
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  if (arr.length <= 3) return arr;
  const rest = arr.slice(3).reduce((s, r) => s + r.amount, 0);
  return [...arr.slice(0, 3), { key: '__other__', label: '其他', amount: rest }];
}

type AllListItem =
  | { type: 'entry'; row: LedgerEntry & { sites?: { name: string } | null } }
  | { type: 'receivable'; row: ReceivableWithRemaining };

// 全部模式:帳面視角(已收付分錄 + 未結的應收應付約定 全部計入),但已收/未收永遠分開標,
// 絕不合成單一模糊數字——收支各自的比例條、常駐雙淨額都是為了守住這條線。
async function AllView({
  sb, month, siteId, kind, invoice, toCheckOnly, ext, base,
}: {
  sb: ReturnType<typeof getSupabaseAdmin>;
  month: string;
  siteId?: string;
  kind?: LedgerKind;
  invoice?: InvoiceStatus;
  toCheckOnly: boolean;
  ext?: string;
  base: SP;
}) {
  let q = sb.from('ledger_entries').select('*, sites(name)').eq('state', 'posted');
  if (month !== 'all') {
    const { from, to } = monthRange(month);
    q = q.gte('occurred_on', from).lte('occurred_on', to);
  }
  if (siteId === NO_SITE) q = q.is('site_id', null);
  else if (siteId) q = q.eq('site_id', siteId);
  if (kind) q = q.eq('kind', kind);
  if (invoice) q = q.eq('invoice_status', invoice);
  if (toCheckOnly) q = q.eq('to_check', true);
  if (ext === 'internal') q = q.eq('is_external', false);
  else if (ext === 'external') q = q.eq('is_external', true);
  q = q.order('occurred_on', { ascending: false }).order('created_at', { ascending: false });

  const [entriesRes, receivablesRes] = await Promise.all([
    q,
    // 應收應付永遠不受月份篩選——這是「現在還欠多少」的餘額,不是某段期間發生的流水。
    fetchReceivablesWithRemaining(sb, { status: 'open' }),
  ]);

  if (entriesRes.error || receivablesRes.error) {
    return (
      <div className="rounded-2xl px-4 py-3 text-[13px]" style={{ background: 'rgba(224,122,122,0.08)', border: '1px solid rgba(224,122,122,0.34)', color: 'var(--nm-danger-glass-text)' }}>
        讀取失敗,以下數字不可信:{entriesRes.error?.message ?? receivablesRes.error}
      </div>
    );
  }

  type Row = LedgerEntry & { sites?: { name: string } | null };
  const entries = (entriesRes.data ?? []) as Row[];
  let receivables = receivablesRes.rows;
  if (siteId === NO_SITE) receivables = receivables.filter((r) => !r.site_id);
  else if (siteId) receivables = receivables.filter((r) => r.site_id === siteId);

  const incomeEntries = entries.filter((r) => r.direction === 'income');
  const expenseEntries = entries.filter((r) => r.direction === 'expense');
  const openReceivables = receivables.filter((r) => r.direction === 'receivable');
  const openPayables = receivables.filter((r) => r.direction === 'payable');

  const { feeTotal } = summarizeEntries(entries);
  const incomeSettled = incomeEntries.reduce((s, r) => s + r.amount_twd, 0);
  const expenseSettled = expenseEntries.reduce((s, r) => s + r.amount_twd, 0);
  const incomeUnsettled = openReceivables.reduce((s, r) => s + Math.max(0, r.remaining_twd), 0);
  const expenseUnsettled = openPayables.reduce((s, r) => s + Math.max(0, r.remaining_twd), 0);
  const incomeFace = incomeSettled + incomeUnsettled;
  const expenseFace = expenseSettled + expenseUnsettled;
  const netFace = incomeFace - expenseFace;
  const netSettled = incomeSettled - expenseSettled - feeTotal;

  // 收入排行按專案(你的收入幾乎都是案件收款,按分類切沒資訊量;按專案切才回答
  // 「這個月的錢是哪幾個案子貢獻的」)。已收+未收合併計入,才是這個專案的完整貢獻。
  const incomeBySite = new Map<string, { label: string; amount: number }>();
  const addSite = (id: string | null, name: string | undefined, amt: number) => {
    const key = id ?? NO_SITE;
    const cur = incomeBySite.get(key) ?? { label: id ? (name ?? '?') : '專案外', amount: 0 };
    cur.amount += amt;
    incomeBySite.set(key, cur);
  };
  incomeEntries.forEach((r) => addSite(r.site_id, r.sites?.name, r.amount_twd));
  openReceivables.forEach((r) => addSite(r.site_id, r.sites?.name, Math.max(0, r.remaining_twd)));
  const incomeRanking = rankTop3(incomeBySite);

  // 支出排行按分類(薪資/貨款/租金…才是「錢花去哪了」的答案)。只算已付分錄——
  // 應付約定沒有 kind 欄位,無法併入同一組排行,未付金額仍完整反映在比例條的「未付」數字。
  const expenseByKind = new Map<string, { label: string; amount: number }>();
  expenseEntries.forEach((r) => {
    const cur = expenseByKind.get(r.kind) ?? { label: LEDGER_KIND_LABEL[r.kind], amount: 0 };
    cur.amount += r.amount_twd;
    expenseByKind.set(r.kind, cur);
  });
  const expenseRanking = rankTop3(expenseByKind);

  // 列表:未結的約定排最上面(那是要行動的),已結的分錄接著照日期排。
  const incomeList: AllListItem[] = [
    ...openReceivables.map((row): AllListItem => ({ type: 'receivable', row })),
    ...incomeEntries.map((row): AllListItem => ({ type: 'entry', row })),
  ];
  const expenseList: AllListItem[] = [
    ...openPayables.map((row): AllListItem => ({ type: 'receivable', row })),
    ...expenseEntries.map((row): AllListItem => ({ type: 'entry', row })),
  ];

  return (
    <div className="space-y-4">
      {/* 淨額帶:帳面 vs 實收實付,兩個數字並排常駐——差距本身就是最重要的警訊 */}
      <div className="rounded-2xl nm-raised-sm p-4 flex flex-wrap gap-8">
        <div>
          <div className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>帳面淨額(含未收未付)</div>
          <div className="text-2xl font-semibold mt-1" style={{ color: netFace >= 0 ? 'var(--nm-success-glass-text)' : 'var(--nm-danger-glass-text)' }}>${fmt(netFace)}</div>
        </div>
        <div>
          <div className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>實收實付淨額(已扣手續費)</div>
          <div className="text-2xl font-semibold mt-1" style={{ color: netSettled >= 0 ? 'var(--nm-success-glass-text)' : 'var(--nm-danger-glass-text)' }}>${fmt(netSettled)}</div>
        </div>
      </div>

      {/* 收支欄首統計:兩欄固定同高,不隨排行筆數多寡變動——切篩選時版面不跳動 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ColumnHeader
          label="收入" faceAmount={incomeFace} settledAmount={incomeSettled} unsettledAmount={incomeUnsettled}
          settledLabel="已收" unsettledLabel="未收" tone="income"
          settledHref={buildHref(base, { mode: 'settled' })} unsettledHref={buildHref(base, { mode: 'receivable' })}
          ranking={incomeRanking} rankingHrefFor={(key) => buildHref(base, { site_id: key })}
        />
        <ColumnHeader
          label="支出" faceAmount={expenseFace} settledAmount={expenseSettled} unsettledAmount={expenseUnsettled}
          settledLabel="已付" unsettledLabel="未付" tone="expense"
          settledHref={buildHref(base, { mode: 'settled' })} unsettledHref={buildHref(base, { mode: 'payable' })}
          ranking={expenseRanking} rankingHrefFor={(key) => buildHref(base, { kind: key })}
        />
      </div>

      {/* 列表:固定高度、內部捲動——同一個框看完 12 筆或 120 筆,位置跟尺寸不會變 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AllColumnList title="收入" tone="income" items={incomeList} />
        <AllColumnList title="支出" tone="expense" items={expenseList} />
      </div>
    </div>
  );
}

// 收支兩欄的列表面板統一用這個高度——固定尺寸、內部捲動,篩選/切月份時版面不跳動。
const LIST_PANEL_HEIGHT = 560;

function ColumnHeader({
  label, faceAmount, settledAmount, unsettledAmount, settledLabel, unsettledLabel, tone,
  settledHref, unsettledHref, ranking, rankingHrefFor,
}: {
  label: string;
  faceAmount: number;
  settledAmount: number;
  unsettledAmount: number;
  settledLabel: string;
  unsettledLabel: string;
  tone: 'income' | 'expense';
  settledHref: string;
  unsettledHref: string;
  ranking: RankRow[];
  rankingHrefFor: (key: string) => string;
}) {
  const toneColor = tone === 'income' ? 'var(--nm-success-glass-text)' : 'var(--nm-danger-glass-text)';
  const total = settledAmount + unsettledAmount;
  const settledPct = total > 0 ? (settledAmount / total) * 100 : 100;
  const maxRank = Math.max(1, ...ranking.map((r) => r.amount));

  return (
    <div className="rounded-2xl nm-raised p-4 flex flex-col" style={{ height: 260 }}>
      <div>
        <div className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>帳面{label}</div>
        <div className="text-2xl font-semibold mt-1" style={{ color: toneColor }}>${fmt(faceAmount)}</div>
      </div>

      {/* 比例條:滿寬代表這一欄自己的 100%,不能拿來跟另一欄比大小——大小比較交給上方淨額帶。
          未收/未付段用斜紋而非純色差,顏色之外永遠搭配第二編碼。 */}
      <div className="mt-3">
        <div className="flex h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
          {settledAmount > 0 && <div style={{ width: `${settledPct}%`, background: toneColor }} />}
          {unsettledAmount > 0 && (
            <div style={{
              width: `${100 - settledPct}%`,
              backgroundImage: `repeating-linear-gradient(45deg, ${toneColor}66, ${toneColor}66 3px, transparent 3px, transparent 7px)`,
              borderLeft: settledAmount > 0 ? `1px dashed ${toneColor}` : undefined,
            }}
            />
          )}
        </div>
        <div className="flex justify-between text-xs mt-1.5">
          <Link href={settledHref} className="underline" style={{ color: 'var(--nm-text-secondary)' }}>{settledLabel} ${fmt(settledAmount)}</Link>
          <Link href={unsettledHref} className="underline" style={{ color: 'var(--nm-text-secondary)' }}>{unsettledLabel} ${fmt(unsettledAmount)}</Link>
        </div>
      </div>

      {ranking.length > 0 && (
        <div className="space-y-1.5 mt-3 pt-1 flex-1 min-h-0 overflow-y-auto">
          {ranking.map((r) => {
            const barPct = (r.amount / maxRank) * 100;
            const content = (
              <div className="flex items-center gap-2 text-xs">
                <span className="truncate w-16 shrink-0" style={{ color: 'var(--nm-text-secondary)' }}>{r.label}</span>
                <span className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <span className="block h-full rounded-full" style={{ width: `${barPct}%`, background: toneColor }} />
                </span>
                <span className="tabular-nums shrink-0" style={{ color: 'var(--nm-text-body)' }}>${fmt(r.amount)}</span>
              </div>
            );
            return r.key === '__other__' ? (
              <div key={r.key}>{content}</div>
            ) : (
              <Link key={r.key} href={rankingHrefFor(r.key)} className="block hover:opacity-80 transition-opacity">{content}</Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AllColumnList({ title, tone, items }: { title: string; tone: 'income' | 'expense'; items: AllListItem[] }) {
  const toneColor = tone === 'income' ? 'var(--nm-success-glass-text)' : 'var(--nm-danger-glass-text)';
  return (
    <div className="space-y-2">
      <div className="text-[13px] font-semibold" style={{ color: toneColor }}>{title} · {items.length} 筆</div>
      {/* 固定高度、內部捲動——面板尺寸跟位置不隨資料多寡改變 */}
      <div className="flex flex-col gap-2 overflow-y-auto pr-1" style={{ height: LIST_PANEL_HEIGHT }}>
        {items.length === 0 && <p className="text-[13px] text-center py-4" style={{ color: 'var(--nm-text-secondary)' }}>沒有紀錄</p>}
        {items.map((item) => (
          item.type === 'entry' ? (
            <LedgerRowMobile key={`e-${item.row.id}`} row={item.row} showSettledBadge />
          ) : (
            <div key={`r-${item.row.id}`} className="nm-raised rounded-2xl p-3.5 flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[14px] font-medium truncate" style={{ color: 'var(--nm-text-body)' }}>{item.row.party}</span>
                <span className="text-[16px] font-semibold tabular-nums" style={{ color: item.row.overpaid ? 'var(--nm-danger-glass-text)' : toneColor }}>
                  {item.row.overpaid ? `超收 $${fmt(Math.abs(item.row.remaining_twd))}` : `$${fmt(item.row.remaining_twd)}`}
                </span>
              </div>
              <div className="text-xs flex flex-wrap gap-x-2 gap-y-1" style={{ color: 'var(--nm-text-secondary)' }}>
                {item.row.sites?.name ? <span>{item.row.sites.name}</span> : <span style={{ color: 'var(--nm-text-faint)' }}>專案外</span>}
                <span>約定 ${fmt(item.row.total_amount_twd)}</span>
              </div>
              <div className="flex items-center justify-between pt-0.5">
                <span className="nm-pill nm-pill-warning">{tone === 'income' ? '未收' : '未付'}</span>
                <StatusButtons id={item.row.id} status={item.row.status} />
              </div>
            </div>
          )
        ))}
      </div>
    </div>
  );
}

async function SettledView({
  sb, month, siteId, kind, invoice, toCheckOnly, ext, showVoided, base,
}: {
  sb: ReturnType<typeof getSupabaseAdmin>;
  month: string;
  siteId?: string;
  kind?: LedgerKind;
  invoice?: InvoiceStatus;
  toCheckOnly: boolean;
  ext?: string;
  showVoided: boolean;
  base: SP;
}) {
  let q = sb.from('ledger_entries').select('*, sites(name)').eq('state', showVoided ? 'voided' : 'posted');
  if (month !== 'all') {
    const { from, to } = monthRange(month);
    q = q.gte('occurred_on', from).lte('occurred_on', to);
  }
  if (siteId === NO_SITE) q = q.is('site_id', null);
  else if (siteId) q = q.eq('site_id', siteId);
  if (kind) q = q.eq('kind', kind);
  if (invoice) q = q.eq('invoice_status', invoice);
  if (toCheckOnly) q = q.eq('to_check', true);
  if (ext === 'internal') q = q.eq('is_external', false);
  else if (ext === 'external') q = q.eq('is_external', true);
  q = q.order('occurred_on', { ascending: false }).order('created_at', { ascending: false });

  const { data, error } = await q;
  type Row = LedgerEntry & { sites?: { name: string } | null };
  const rows: Row[] = (data ?? []) as Row[];
  const incomeRows = rows.filter((r) => r.direction === 'income');
  const expenseRows = rows.filter((r) => r.direction === 'expense');
  const { income, expense, net, extIncome, extTax, feeTotal } = summarizeEntries(rows);

  if (error) {
    return (
      <div className="rounded-2xl px-4 py-3 text-[13px]" style={{ background: 'rgba(224,122,122,0.08)', border: '1px solid rgba(224,122,122,0.34)', color: 'var(--nm-danger-glass-text)' }}>
        讀取失敗,以下數字不可信:{error.message}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard label="收入合計" value={`$${fmt(income)}`} tone="income" />
        <SummaryCard label="支出合計" value={`$${fmt(expense)}`} tone="expense" />
        <SummaryCard label="淨額(已扣手續費)" value={`$${fmt(net)}`} tone={net >= 0 ? 'income' : 'expense'} />
        <div className="rounded-2xl nm-raised-sm p-3 text-[13px]">
          <div style={{ color: 'var(--nm-text-secondary)' }}>外帳彙總</div>
          <div className="mt-1" style={{ color: 'var(--nm-text-body)' }}>收入 <span className="font-semibold">${fmt(extIncome)}</span> · 稅額 <span className="font-semibold">${fmt(extTax)}</span></div>
        </div>
        <div className="rounded-2xl nm-raised-sm p-3 text-[13px]">
          <div style={{ color: 'var(--nm-text-secondary)' }}>手續費合計</div>
          <div className="mt-1 text-lg font-semibold" style={{ color: 'var(--nm-text-body)' }}>${fmt(feeTotal)}</div>
        </div>
      </div>

      {showVoided && (
        <div className="rounded-xl px-3 py-2 text-[13px]" style={{ background: 'rgba(217,181,107,0.09)', border: '1px solid rgba(217,181,107,0.3)', color: 'var(--nm-warning-glass-text)' }}>
          目前顯示已作廢帳目(不計入合計)。<Link href={buildHref(base, { show_voided: undefined })} className="underline ml-1">返回作用中</Link>
        </div>
      )}
      {!showVoided && (
        <div className="text-right">
          <Link href={buildHref(base, { show_voided: '1' })} className="text-[13px] underline" style={{ color: 'var(--nm-text-muted)' }}>顯示已作廢</Link>
        </div>
      )}

      <EntrySection title="收入" rows={incomeRows} tone="income" />
      <EntrySection title="支出" rows={expenseRows} tone="expense" />
    </div>
  );
}

function EntrySection({ title, rows, tone }: { title: string; rows: Array<LedgerEntry & { sites?: { name: string } | null }>; tone: 'income' | 'expense' }) {
  const toneColor = tone === 'income' ? 'var(--nm-success-glass-text)' : 'var(--nm-danger-glass-text)';
  return (
    <div className="space-y-2">
      <div className="text-[13px] font-semibold" style={{ color: toneColor }}>{title} · {rows.length} 筆</div>

      {/* 手機:卡片流,固定高度、內部捲動 */}
      <div className="lg:hidden flex flex-col gap-3 overflow-y-auto pr-1" style={{ height: LIST_PANEL_HEIGHT }}>
        {rows.length === 0 && <p className="text-[13px] text-center py-4" style={{ color: 'var(--nm-text-secondary)' }}>沒有紀錄</p>}
        {rows.map((r) => <LedgerRowMobile key={r.id} row={r} />)}
      </div>

      {/* 桌機:表格,固定高度、內部捲動——跟「全部」模式的列表面板同高,切模式不跳動 */}
      <div className="hidden lg:block rounded-2xl nm-raised overflow-x-auto overflow-y-auto" style={{ height: LIST_PANEL_HEIGHT }}>
        <table className="w-full text-[13px]" style={{ minWidth: 1000, borderCollapse: 'collapse' }}>
          <thead style={{ background: 'rgba(20,20,24,0.92)' }}>
            <tr style={{ color: 'var(--nm-text-muted)' }}>
              <th className="text-left px-3 py-2 font-normal whitespace-nowrap">日期</th>
              <th className="text-left px-3 py-2 font-normal whitespace-nowrap">分類</th>
              <th className="text-left px-3 py-2 font-normal whitespace-nowrap">對象</th>
              <th className="text-left px-3 py-2 font-normal whitespace-nowrap">歸屬</th>
              <th className="text-right px-3 py-2 font-normal whitespace-nowrap">金額</th>
              <th className="text-left px-3 py-2 font-normal whitespace-nowrap">發票</th>
              <th className="text-left px-3 py-2 font-normal whitespace-nowrap">備註</th>
              <th className="text-left px-3 py-2 font-normal whitespace-nowrap">動作</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>沒有紀錄</td></tr>
            )}
            {rows.map((r) => {
              const voided = r.state === 'voided';
              return (
                <tr key={r.id} style={{ borderTop: '1px solid var(--nm-border-hair)', opacity: voided ? 0.5 : 1 }}>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>{r.occurred_on}</td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--nm-text-body)' }}>
                    {LEDGER_KIND_LABEL[r.kind]}
                    {r.source_batch_id && <span className="nm-pill nm-pill-muted ml-2">薪資結算匯入</span>}
                    {r.to_check && <span className="nm-pill nm-pill-warning ml-2">待確認</span>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>{r.party ?? '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>
                    {r.sites?.name ?? <span style={{ color: 'var(--nm-text-faint)' }}>專案外</span>}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono tabular whitespace-nowrap ${voided ? 'line-through' : ''}`} style={{ color: 'var(--nm-text-body)' }}>${fmt(r.amount_twd)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.invoice_status === 'none' && <span style={{ color: 'var(--nm-text-secondary)' }}>—</span>}
                    {r.invoice_status === 'to_issue' && <span className="nm-pill nm-pill-warning">{INVOICE_STATUS_LABEL.to_issue}</span>}
                    {r.invoice_status === 'issued' && (
                      <span className="nm-pill" style={{ color: 'var(--nm-success-glass-text)', background: 'rgba(126,207,157,0.1)', borderColor: 'rgba(126,207,157,0.28)' }}>
                        {INVOICE_STATUS_LABEL.issued}{r.invoice_date && <span className="ml-1" style={{ color: 'var(--nm-text-muted)' }}>{r.invoice_date}</span>}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 max-w-[14rem]">
                    <div className="truncate" title={r.memo ?? ''} style={{ color: 'var(--nm-text-secondary)' }}>{r.memo ?? ''}</div>
                    {voided && r.voided_reason && <div className="text-xs whitespace-nowrap" style={{ color: 'var(--nm-text-muted)' }}>作廢原因:{r.voided_reason}</div>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {!voided && (
                      <div className="flex gap-2 items-center">
                        <Link href={`/boss/ledger/${r.id}`} className="underline" style={{ color: 'var(--nm-text-secondary)' }}>編輯</Link>
                        <VoidDialog id={r.id} summary={`${r.occurred_on} · ${LEDGER_KIND_LABEL[r.kind]} · ${r.party ?? '—'} · $${fmt(r.amount_twd)}`} />
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

async function ReceivablesView({
  sb, direction, siteId,
}: {
  sb: ReturnType<typeof getSupabaseAdmin>;
  direction: ReceivableDirection;
  siteId?: string;
}) {
  // 應收/應付永遠不受月份篩選——這是「現在還欠多少」的餘額,不是某段期間發生的流水。
  const { rows: allRows, error } = await fetchReceivablesWithRemaining(sb, { direction });
  const rows = siteId
    ? (siteId === NO_SITE ? allRows.filter((r) => !r.site_id) : allRows.filter((r) => r.site_id === siteId))
    : allRows;
  const openRows = rows.filter((r) => r.status === 'open');
  const { receivableOpenTotal, payableOpenTotal } = summarizeReceivables(openRows as ReceivableSummaryRow[]);
  const total = direction === 'receivable' ? receivableOpenTotal : payableOpenTotal;

  if (error) {
    return (
      <div className="rounded-2xl px-4 py-3 text-[13px]" style={{ background: 'rgba(224,122,122,0.08)', border: '1px solid rgba(224,122,122,0.34)', color: 'var(--nm-danger-glass-text)' }}>
        讀取失敗,以下數字不可信:{error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl nm-raised-sm p-3 text-[13px] max-w-xs">
        <div style={{ color: 'var(--nm-text-secondary)' }}>尚未{direction === 'receivable' ? '收到' : '付出'}</div>
        <div className="text-lg font-semibold mt-1" style={{ color: direction === 'receivable' ? 'var(--nm-success-glass-text)' : 'var(--nm-danger-glass-text)' }}>${fmt(total)}</div>
      </div>

      {/* 手機:卡片流,固定高度、內部捲動 */}
      <div className="lg:hidden flex flex-col gap-3 overflow-y-auto pr-1" style={{ height: LIST_PANEL_HEIGHT }}>
        {rows.length === 0 && <p className="text-[13px] text-center py-6" style={{ color: 'var(--nm-text-secondary)' }}>沒有紀錄</p>}
        {rows.map((r) => <ReceivableRowMobile key={r.id} row={r} />)}
      </div>

      {/* 桌機:表格,固定高度、內部捲動——跟其他模式的列表面板同高,切模式不跳動 */}
      <div className="hidden lg:block rounded-2xl nm-raised overflow-x-auto overflow-y-auto" style={{ height: LIST_PANEL_HEIGHT }}>
        <table className="w-full text-[13px]" style={{ minWidth: 900, borderCollapse: 'collapse' }}>
          <thead style={{ background: 'rgba(20,20,24,0.92)' }}>
            <tr style={{ color: 'var(--nm-text-muted)' }}>
              <th className="text-left px-3 py-2 font-normal whitespace-nowrap">對象</th>
              <th className="text-left px-3 py-2 font-normal whitespace-nowrap">歸屬</th>
              <th className="text-right px-3 py-2 font-normal whitespace-nowrap">約定總額</th>
              <th className="text-right px-3 py-2 font-normal whitespace-nowrap">已結</th>
              <th className="text-right px-3 py-2 font-normal whitespace-nowrap">未結</th>
              <th className="text-left px-3 py-2 font-normal whitespace-nowrap">狀態</th>
              <th className="text-left px-3 py-2 font-normal whitespace-nowrap">動作</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>沒有紀錄</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} style={{ borderTop: '1px solid var(--nm-border-hair)' }}>
                <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--nm-text-body)' }}>{r.party}</td>
                <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>{r.sites?.name ?? '專案外'}</td>
                <td className="px-3 py-2 text-right font-mono tabular whitespace-nowrap" style={{ color: 'var(--nm-text-body)' }}>${fmt(r.total_amount_twd)}</td>
                <td className="px-3 py-2 text-right font-mono tabular whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>${fmt(r.settled_twd)}</td>
                <td className="px-3 py-2 text-right font-mono tabular whitespace-nowrap" style={{ color: r.overpaid ? 'var(--nm-danger-glass-text)' : 'var(--nm-text-body)' }}>
                  {r.overpaid ? `超收 $${fmt(Math.abs(r.remaining_twd))}` : `$${fmt(r.remaining_twd)}`}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.status === 'open' && <span className="nm-pill nm-pill-warning">未結</span>}
                  {r.status === 'closed' && <span className="nm-pill" style={{ color: 'var(--nm-success-glass-text)', background: 'rgba(126,207,157,0.1)', borderColor: 'rgba(126,207,157,0.28)' }}>已結清</span>}
                  {r.status === 'voided' && <span className="nm-pill nm-pill-muted line-through">已作廢</span>}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <StatusButtons id={r.id} status={r.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ReceivableForm />
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: 'income' | 'expense' }) {
  const color = tone === 'income' ? 'var(--nm-success-glass-text)' : 'var(--nm-danger-glass-text)';
  return (
    <div className="rounded-2xl nm-raised-sm p-3">
      <div className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>{label}</div>
      <div className="text-2xl font-semibold mt-1" style={{ color }}>{value}</div>
    </div>
  );
}
