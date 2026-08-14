import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';
import { fetchReceivablesWithRemaining } from '@/lib/receivables-query';
import { RECEIVABLE_DIRECTION_LABEL, type ReceivableDirection } from '@/lib/types';
import ReceivableForm from './ReceivableForm';
import StatusButtons from './StatusButtons';

export const dynamic = 'force-dynamic';

export default async function ReceivablesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; direction?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'boss') redirect('/staff');

  const sp = await searchParams;
  const statusFilter = sp.status === 'all' ? undefined : (sp.status === 'closed' || sp.status === 'voided' ? sp.status : 'open') as 'open' | 'closed' | 'voided' | undefined;
  const directionFilter = sp.direction === 'receivable' || sp.direction === 'payable' ? (sp.direction as ReceivableDirection) : undefined;

  const sb = getSupabaseAdmin();
  const { rows, error } = await fetchReceivablesWithRemaining(sb, { status: statusFilter, direction: directionFilter });

  const fmt = (n: number) => n.toLocaleString('zh-TW');
  const openReceivable = rows.filter((r) => r.direction === 'receivable' && r.status === 'open').reduce((s, r) => s + Math.max(0, r.remaining_twd), 0);
  const openPayable = rows.filter((r) => r.direction === 'payable' && r.status === 'open').reduce((s, r) => s + Math.max(0, r.remaining_twd), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--nm-text-primary)' }}>應收應付</h1>
          <p className="text-[13px] mt-0.5" style={{ color: 'var(--nm-text-secondary)' }}>
            記約定,再把後續金流帳目掛上去;未結金額自動算,超收超付會 loud 標示,不靜默吞。
          </p>
        </div>
        <Link href="/boss/ledger" className="text-[13px] underline" style={{ color: 'var(--nm-text-muted)' }}>← 回帳務</Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
        <div className="rounded-2xl nm-raised-sm p-3 text-[13px]">
          <div style={{ color: 'var(--nm-text-secondary)' }}>在手應收(未結)</div>
          <div className="text-lg font-semibold mt-1" style={{ color: 'var(--nm-success-glass-text)' }}>${fmt(openReceivable)}</div>
        </div>
        <div className="rounded-2xl nm-raised-sm p-3 text-[13px]">
          <div style={{ color: 'var(--nm-text-secondary)' }}>在手應付(未結)</div>
          <div className="text-lg font-semibold mt-1" style={{ color: 'var(--nm-danger-glass-text)' }}>${fmt(openPayable)}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 text-[13px]">
          {(['open', 'closed', 'voided', 'all'] as const).map((f) => (
            <Link
              key={f}
              href={`/boss/ledger/receivables?status=${f}${directionFilter ? `&direction=${directionFilter}` : ''}`}
              className={(statusFilter ?? 'all') === f || (f === 'open' && !sp.status) ? 'nm-btn-solid' : 'nm-btn'}
              style={{ borderRadius: 999, padding: '4px 14px', minHeight: 'auto' }}
            >
              {f === 'open' ? '未結' : f === 'closed' ? '已結清' : f === 'voided' ? '已作廢' : '全部'}
            </Link>
          ))}
        </div>
        {directionFilter && (
          <span className="text-[13px] flex items-center gap-2" style={{ color: 'var(--nm-text-muted)' }}>
            篩選中:只看{RECEIVABLE_DIRECTION_LABEL[directionFilter]}
            <Link href={`/boss/ledger/receivables?status=${statusFilter ?? 'open'}`} className="underline">清除</Link>
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-xl p-3 text-[13px]" style={{ background: 'rgba(224,122,122,0.08)', border: '1px solid rgba(224,122,122,0.34)', color: 'var(--nm-danger-glass-text)' }}>
          讀取失敗:{error}
        </div>
      )}

      <div className="rounded-2xl nm-raised overflow-x-auto overflow-y-auto">
        <table className="w-full text-[13px]" style={{ minWidth: 900, borderCollapse: 'collapse' }}>
          <thead style={{ background: 'rgba(20,20,24,0.92)' }}>
            <tr style={{ color: 'var(--nm-text-muted)' }}>
              <th className="text-left px-3 py-2 font-normal whitespace-nowrap">方向</th>
              <th className="text-left px-3 py-2 font-normal whitespace-nowrap">對象</th>
              <th className="text-left px-3 py-2 font-normal whitespace-nowrap">案場</th>
              <th className="text-right px-3 py-2 font-normal whitespace-nowrap">約定總額</th>
              <th className="text-right px-3 py-2 font-normal whitespace-nowrap">已結</th>
              <th className="text-right px-3 py-2 font-normal whitespace-nowrap">未結</th>
              <th className="text-left px-3 py-2 font-normal whitespace-nowrap">狀態</th>
              <th className="text-left px-3 py-2 font-normal whitespace-nowrap">動作</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>沒有紀錄</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} style={{ borderTop: '1px solid var(--nm-border-hair)' }}>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className={r.direction === 'receivable' ? '' : ''} style={{ color: r.direction === 'receivable' ? 'var(--nm-success-glass-text)' : 'var(--nm-danger-glass-text)' }}>
                    {RECEIVABLE_DIRECTION_LABEL[r.direction]}
                  </span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--nm-text-body)' }}>{r.party}</td>
                <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>{r.sites?.name ?? '—'}</td>
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
