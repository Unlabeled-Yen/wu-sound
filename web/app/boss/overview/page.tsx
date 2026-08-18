import { requirePageCapability } from '@/lib/require-capability';
import { getSupabaseAdmin } from '@/lib/supabase';
import { summarizeEntries } from '@/lib/ledger-summary';
import { fetchReceivablesWithRemaining } from '@/lib/receivables-query';

export const dynamic = 'force-dynamic';

// 老闆手機版抽屜「總覽(金流摘要)」(2026-08-18 Yen 定案)——聊天首頁取代
// 掉原本的財務儀表板後,這裡只留最精簡的一份:金流監測最上面那條的口徑
// (/boss/ledger 的 DashboardView.tsx,同一套 summarizeEntries +
// fetchReceivablesWithRemaining 算法),不重現整張監測帶或儀表板的其他
// 卡片——要看完整版就是走「財務」那個抽屜項目進 /boss/ledger。
const fmt = (n: number) => n.toLocaleString('zh-TW');
const signed = (n: number) => (n >= 0 ? `＋$${fmt(n)}` : `$${fmt(n)}`);

export default async function BossOverviewPage() {
  await requirePageCapability('finance');
  const sb = getSupabaseAdmin();

  const [entriesRes, receivablesRes] = await Promise.all([
    sb.from('ledger_entries').select('direction, amount_twd, fee_twd').eq('state', 'posted'),
    fetchReceivablesWithRemaining(sb, { status: 'open' }),
  ]);

  if (entriesRes.error || receivablesRes.error) {
    return (
      <div className="rounded-2xl px-4 py-3 text-[13px]" style={{ background: 'rgba(224,122,122,0.08)', border: '1px solid rgba(224,122,122,0.34)', color: 'var(--nm-danger-glass-text)' }}>
        讀取失敗,以下數字不可信:{entriesRes.error?.message ?? receivablesRes.error}
      </div>
    );
  }

  const { income: incomeSettled, expense: expenseSettled, net: netSettled } = summarizeEntries(entriesRes.data ?? []);
  const incomeUnsettled = receivablesRes.rows
    .filter((r) => r.direction === 'receivable')
    .reduce((s, r) => s + Math.max(0, r.remaining_twd), 0);
  const expenseUnsettled = receivablesRes.rows
    .filter((r) => r.direction === 'payable')
    .reduce((s, r) => s + Math.max(0, r.remaining_twd), 0);
  const netFace = incomeSettled + incomeUnsettled - (expenseSettled + expenseUnsettled);

  const netColor = netSettled >= 0 ? 'var(--nm-success-glass-text)' : 'var(--nm-danger-glass-text)';

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-[22px] nm-raised-sm p-[22px]">
        <div className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>實收實付淨額</div>
        <div className="tabular-nums mt-2" style={{ fontSize: 34, fontWeight: 600, lineHeight: 1, color: netColor }}>
          {signed(netSettled)}
        </div>
        <div className="mt-2.5 text-[12px]" style={{ color: 'var(--nm-text-faint)' }}>
          帳面淨額(含未收未付){' '}
          <span className="tabular-nums" style={{ color: 'var(--nm-text-secondary)' }}>{signed(netFace)}</span>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="text-[12px] uppercase tracking-[0.14em]" style={{ color: '#8a8b90' }}>已收付</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="nm-raised rounded-[16px] px-4 py-3.5">
            <div className="text-[12px]" style={{ color: 'var(--nm-text-secondary)' }}>已收</div>
            <div className="tabular-nums text-[19px] font-medium mt-1" style={{ color: 'var(--nm-success-glass-text)' }}>${fmt(incomeSettled)}</div>
          </div>
          <div className="nm-raised rounded-[16px] px-4 py-3.5">
            <div className="text-[12px]" style={{ color: 'var(--nm-text-secondary)' }}>已付</div>
            <div className="tabular-nums text-[19px] font-medium mt-1" style={{ color: 'var(--nm-text-body)' }}>${fmt(expenseSettled)}</div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="text-[12px] uppercase tracking-[0.14em]" style={{ color: '#8a8b90' }}>未收未付</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="nm-raised rounded-[16px] px-4 py-3.5">
            <div className="text-[12px]" style={{ color: 'var(--nm-text-secondary)' }}>應收款(未收)</div>
            <div className="tabular-nums text-[19px] font-medium mt-1" style={{ color: 'var(--nm-warning-glass-text)' }}>${fmt(incomeUnsettled)}</div>
          </div>
          <div className="nm-raised rounded-[16px] px-4 py-3.5">
            <div className="text-[12px]" style={{ color: 'var(--nm-text-secondary)' }}>應付款(未付)</div>
            <div className="tabular-nums text-[19px] font-medium mt-1" style={{ color: 'var(--nm-danger-glass-text)' }}>${fmt(expenseUnsettled)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
