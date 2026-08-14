import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';
import { fetchReceivablesWithRemaining } from '@/lib/receivables-query';
import { NON_OPERATING_KINDS, type LedgerEntry } from '@/lib/types';
import { periodRange, shiftPeriod, isValidPeriodValue, currentPeriodValue, type PeriodType } from '@/lib/report-period';

export const dynamic = 'force-dynamic';

type Dim = 'overview' | 'category' | 'project' | 'customer';

interface SP {
  period?: string; // period type
  value?: string;
  dim?: string;
}

type SiteInfo = { name: string; category_id: string | null; customer_name: string | null };
type Row = LedgerEntry & { sites?: SiteInfo | null };

const fmt = (n: number) => n.toLocaleString('zh-TW');

function buildHref(base: Required<Pick<SP, 'period' | 'value' | 'dim'>>, overrides: Partial<SP>): string {
  const merged = { ...base, ...overrides };
  const p = new URLSearchParams();
  p.set('period', merged.period);
  p.set('value', merged.value);
  p.set('dim', merged.dim);
  return `/boss/report?${p.toString()}`;
}

export default async function ReportPage({ searchParams }: { searchParams: Promise<SP> }) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'boss') redirect('/staff');

  const sp = (await searchParams) ?? {};
  const periodType: PeriodType = sp.period === 'quarter' || sp.period === 'year' ? sp.period : 'month';
  const value = sp.value && isValidPeriodValue(periodType, sp.value) ? sp.value : currentPeriodValue(periodType);
  const dim: Dim = (['overview', 'category', 'project', 'customer'] as const).includes(sp.dim as Dim) ? (sp.dim as Dim) : 'overview';

  const { from, to, label } = periodRange(periodType, value);
  const base = { period: periodType, value, dim };

  const sb = getSupabaseAdmin();
  const [{ data, error }, { rows: openReceivables, error: recvError }] = await Promise.all([
    sb
      .from('ledger_entries')
      .select('*, sites(name, category_id, customer_name)')
      .eq('status', 'active')
      .gte('occurred_on', from)
      .lt('occurred_on', to),
    fetchReceivablesWithRemaining(sb, { status: 'open' }),
  ]);

  const rows: Row[] = (data ?? []) as Row[];

  let operatingIncome = 0, nonOperatingIncome = 0, operatingExpense = 0, nonOperatingExpense = 0, feeTotal = 0;
  for (const r of rows) {
    const nonOp = NON_OPERATING_KINDS.includes(r.kind);
    if (r.direction === 'income') {
      if (nonOp) nonOperatingIncome += r.amount_twd; else operatingIncome += r.amount_twd;
    } else {
      if (nonOp) nonOperatingExpense += r.amount_twd; else operatingExpense += r.amount_twd;
    }
    feeTotal += r.fee_twd ?? 0;
  }
  // 同 /boss/ledger 口徑:淨額扣手續費,不虛高。
  const netOperating = operatingIncome - operatingExpense - feeTotal;

  const openReceivableTotal = openReceivables.filter((r) => r.direction === 'receivable').reduce((s, r) => s + Math.max(0, r.remaining_twd), 0);
  const openPayableTotal = openReceivables.filter((r) => r.direction === 'payable').reduce((s, r) => s + Math.max(0, r.remaining_twd), 0);

  // 分組:排除業外/借款(kind 屬 NON_OPERATING_KINDS 的帳目不進案件類別/專案/客戶分組,只留在總覽的業外小計)
  const operatingRows = rows.filter((r) => !NON_OPERATING_KINDS.includes(r.kind));

  interface GroupAgg { key: string; label: string; income: number; expense: number; sub?: string[] }
  function aggregate(keyOf: (r: Row) => string | null, labelOf: (r: Row) => string): { groups: GroupAgg[]; residualCount: number; residualIncome: number; residualExpense: number } {
    const map = new Map<string, GroupAgg>();
    let residualCount = 0, residualIncome = 0, residualExpense = 0;
    for (const r of operatingRows) {
      const k = keyOf(r);
      if (!k) {
        residualCount += 1;
        if (r.direction === 'income') residualIncome += r.amount_twd; else residualExpense += r.amount_twd;
        continue;
      }
      const g = map.get(k) ?? { key: k, label: labelOf(r), income: 0, expense: 0, sub: [] };
      if (r.direction === 'income') g.income += r.amount_twd; else g.expense += r.amount_twd;
      const siteName = r.sites?.name;
      if (siteName && g.sub && !g.sub.includes(siteName)) g.sub.push(siteName);
      map.set(k, g);
    }
    return { groups: Array.from(map.values()).sort((a, b) => (b.income + b.expense) - (a.income + a.expense)), residualCount, residualIncome, residualExpense };
  }

  let result: { groups: GroupAgg[]; residualCount: number; residualIncome: number; residualExpense: number } | null = null;
  if (dim === 'category') {
    result = aggregate(
      (r) => (r.sites?.category_id ? r.sites.category_id : null),
      (r) => r.sites?.category_id ?? '',
    );
    // category_id 只是 uuid,需要名稱;另外查一次
  }
  let categoryNames = new Map<string, string>();
  if (dim === 'category') {
    const { data: cats } = await sb.from('site_categories').select('id, name');
    categoryNames = new Map((cats ?? []).map((c: { id: string; name: string }) => [c.id, c.name]));
    if (result) {
      for (const g of result.groups) g.label = categoryNames.get(g.key) ?? '(未知類別)';
    }
  }
  if (dim === 'project') {
    result = aggregate(
      (r) => r.site_id,
      (r) => r.sites?.name ?? '',
    );
  }
  if (dim === 'customer') {
    result = aggregate(
      (r) => (r.sites?.customer_name ? r.sites.customer_name : null),
      (r) => r.sites?.customer_name ?? '',
    );
  }

  const total = operatingRows.reduce((s, r) => s + r.amount_twd, 0);
  const groupedTotal = result ? result.groups.reduce((s, g) => s + g.income + g.expense, 0) + result.residualIncome + result.residualExpense : 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: 'var(--nm-text-primary)' }}>報表中心</h1>
        <p className="text-[13px] mt-0.5" style={{ color: 'var(--nm-text-secondary)' }}>
          全視圖現金制;在手應收/應付是現在的餘額,不受期間篩選影響。
        </p>
      </div>

      {/* 期間選擇 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 text-[13px]">
          {(['month', 'quarter', 'year'] as const).map((t) => (
            <Link
              key={t}
              href={buildHref(base, { period: t, value: currentPeriodValue(t) })}
              className={periodType === t ? 'nm-btn-solid' : 'nm-btn'}
              style={{ borderRadius: 999, padding: '4px 14px', minHeight: 'auto' }}
            >
              {t === 'month' ? '月' : t === 'quarter' ? '季' : '年'}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-2 text-[13px]">
          <Link href={buildHref(base, { value: shiftPeriod(periodType, value, -1) })} className="nm-btn" style={{ padding: '4px 10px', minHeight: 'auto' }}>← 上期</Link>
          <span className="font-semibold min-w-[7rem] text-center" style={{ color: 'var(--nm-text-primary)' }}>{label}</span>
          <Link href={buildHref(base, { value: shiftPeriod(periodType, value, 1) })} className="nm-btn" style={{ padding: '4px 10px', minHeight: 'auto' }}>下期 →</Link>
        </div>
        <div className="flex gap-1 text-[13px]">
          {([
            ['overview', '總覽'],
            ['category', '案件類別'],
            ['project', '專案'],
            ['customer', '客戶'],
          ] as const).map(([d, l]) => (
            <Link
              key={d}
              href={buildHref(base, { dim: d })}
              className={dim === d ? 'nm-btn-solid' : 'nm-btn'}
              style={{ borderRadius: 999, padding: '4px 14px', minHeight: 'auto' }}
            >{l}</Link>
          ))}
        </div>
      </div>

      {(error || recvError) && (
        <div className="rounded-xl p-3 text-[13px]" style={{ background: 'rgba(224,122,122,0.08)', border: '1px solid rgba(224,122,122,0.34)', color: 'var(--nm-danger-glass-text)' }}>
          讀取失敗:{error?.message ?? recvError}
        </div>
      )}

      {/* 常駐:在手應收應付 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
        <div className="rounded-2xl nm-raised-sm p-3 text-[13px]">
          <div style={{ color: 'var(--nm-text-secondary)' }}>在手應收(現在,不受期間篩選影響)</div>
          <div className="text-lg font-semibold mt-1" style={{ color: 'var(--nm-success-glass-text)' }}>${fmt(openReceivableTotal)}</div>
        </div>
        <div className="rounded-2xl nm-raised-sm p-3 text-[13px]">
          <div style={{ color: 'var(--nm-text-secondary)' }}>在手應付(現在,不受期間篩選影響)</div>
          <div className="text-lg font-semibold mt-1" style={{ color: 'var(--nm-danger-glass-text)' }}>${fmt(openPayableTotal)}</div>
        </div>
      </div>

      {dim === 'overview' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <SummaryCard label="營收(排業外/借款)" value={`$${fmt(operatingIncome)}`} tone="income" />
          <SummaryCard label="支出(排業外/投資健檢)" value={`$${fmt(operatingExpense)}`} tone="expense" />
          <SummaryCard label="淨額(已扣手續費,未含人力成本)" value={`$${fmt(netOperating)}`} tone={netOperating >= 0 ? 'income' : 'expense'} />
          <div className="rounded-2xl nm-raised-sm p-3 text-[13px]">
            <div style={{ color: 'var(--nm-text-secondary)' }}>業外/個人小計</div>
            <div className="mt-1" style={{ color: 'var(--nm-text-body)' }}>借款等業外收入 <span className="font-semibold">${fmt(nonOperatingIncome)}</span></div>
            <div style={{ color: 'var(--nm-text-body)' }}>投資/健檢等 <span className="font-semibold">${fmt(nonOperatingExpense)}</span></div>
          </div>
          <div className="rounded-2xl nm-raised-sm p-3 text-[13px]">
            <div style={{ color: 'var(--nm-text-secondary)' }}>轉帳手續費合計</div>
            <div className="mt-1 text-lg font-semibold" style={{ color: 'var(--nm-text-body)' }}>${fmt(feeTotal)}</div>
          </div>
        </div>
      )}

      {dim !== 'overview' && result && (
        <div className="space-y-2">
          <div className="rounded-2xl nm-raised overflow-x-auto overflow-y-auto">
            <table className="w-full text-[13px]" style={{ minWidth: 760, borderCollapse: 'collapse' }}>
              <thead style={{ background: 'rgba(20,20,24,0.92)' }}>
                <tr style={{ color: 'var(--nm-text-muted)' }}>
                  <th className="text-left px-3 py-2 font-normal whitespace-nowrap">
                    {dim === 'category' ? '案件類別' : dim === 'project' ? '專案' : '客戶'}
                  </th>
                  <th className="text-right px-3 py-2 font-normal whitespace-nowrap">本期收入</th>
                  <th className="text-right px-3 py-2 font-normal whitespace-nowrap">本期支出</th>
                  <th className="text-right px-3 py-2 font-normal whitespace-nowrap">{dim === 'project' ? '粗毛利(未含人力)' : '淨額'}</th>
                  {dim !== 'project' && <th className="text-left px-3 py-2 font-normal whitespace-nowrap">組成</th>}
                  {dim === 'project' && <th className="text-left px-3 py-2 font-normal whitespace-nowrap">動作</th>}
                </tr>
              </thead>
              <tbody>
                {result.groups.length === 0 && result.residualCount === 0 && (
                  <tr><td colSpan={5} className="px-3 py-6 text-center whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>本期沒有資料</td></tr>
                )}
                {result.groups.map((g) => (
                  <tr key={g.key} style={{ borderTop: '1px solid var(--nm-border-hair)' }}>
                    <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--nm-text-body)' }}>{g.label || '(未命名)'}</td>
                    <td className="px-3 py-2 text-right font-mono tabular whitespace-nowrap" style={{ color: 'var(--nm-success-glass-text)' }}>${fmt(g.income)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular whitespace-nowrap" style={{ color: 'var(--nm-danger-glass-text)' }}>${fmt(g.expense)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular whitespace-nowrap" style={{ color: 'var(--nm-text-body)' }}>${fmt(g.income - g.expense)}</td>
                    {dim !== 'project' && (
                      <td className="px-3 py-2" style={{ color: 'var(--nm-text-secondary)' }}>
                        <div className="flex flex-wrap gap-1">
                          {(g.sub ?? []).map((s) => <span key={s} className="nm-pill nm-pill-muted">{s}</span>)}
                        </div>
                      </td>
                    )}
                    {dim === 'project' && (
                      <td className="px-3 py-2 whitespace-nowrap">
                        {periodType === 'month' ? (
                          <Link href={`/boss/ledger?month=${value}&site_id=${g.key}`} className="underline text-xs" style={{ color: 'var(--nm-text-muted)' }}>看帳目明細</Link>
                        ) : (
                          <span className="text-xs" style={{ color: 'var(--nm-text-faint)' }}>切到月檢視可下鑽</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                {result.residualCount > 0 && (
                  <tr style={{ borderTop: '1px solid var(--nm-border-hair)', background: 'rgba(217,181,107,0.06)' }}>
                    <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--nm-warning-glass-text)' }}>
                      未歸類{dim === 'category' ? '(無案場或案場未設類別)' : dim === 'project' ? '(未掛案場)' : '(無案場或案場未填客戶)'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular whitespace-nowrap" style={{ color: 'var(--nm-warning-glass-text)' }}>${fmt(result.residualIncome)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular whitespace-nowrap" style={{ color: 'var(--nm-warning-glass-text)' }}>${fmt(result.residualExpense)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular whitespace-nowrap" style={{ color: 'var(--nm-warning-glass-text)' }}>${fmt(result.residualIncome - result.residualExpense)}</td>
                    <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--nm-warning-glass-text)' }}>另有 {result.residualCount} 筆</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs" style={{ color: 'var(--nm-text-faint)' }}>
            殘差行恆等式:各分項 + 未歸類 = 本期營運帳目總額(${fmt(total)})。目前合計 ${fmt(groupedTotal)}{groupedTotal !== total ? '(不符,請回報)' : '(相符)'}。
            {dim === 'project' && ' 本表為本期活動金額,非案子完整生命週期損益;金額未扣人力成本,是粗毛利、非實際獲利。'}
          </p>
        </div>
      )}
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
