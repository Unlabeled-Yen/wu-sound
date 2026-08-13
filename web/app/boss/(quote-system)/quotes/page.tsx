import Link from 'next/link';
import type { CSSProperties } from 'react';
import { getSupabaseAdmin } from '@/lib/supabase';
import { QUOTE_STATUS_LABEL, type Quote, type QuoteLine, type QuoteStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

const fmt = (n: number) => n.toLocaleString('zh-TW');

const STATUS_STYLE: Record<QuoteStatus, string> = {
  draft: 'nm-pill-muted',
  sent: 'nm-pill-neutral',
  won: '',
  lost: 'nm-pill-danger',
};
const STATUS_INLINE: Partial<Record<QuoteStatus, CSSProperties>> = {
  won: {
    color: 'var(--nm-success-glass-text)',
    background: 'rgba(126, 207, 157, 0.08)',
    borderColor: 'rgba(126, 207, 157, 0.26)',
  },
};

export default async function QuotesPage() {
  const sb = getSupabaseAdmin();
  const { data: quotesData, error } = await sb
    .from('quotes')
    .select('*')
    .order('created_at', { ascending: false });
  const quotes = (quotesData ?? []) as Quote[];

  const byQuote = new Map<string, QuoteLine[]>();
  if (quotes.length > 0) {
    const { data: lines } = await sb
      .from('quote_lines')
      .select('quote_id, qty, unit_price_twd')
      .in('quote_id', quotes.map((q) => q.id));
    for (const l of (lines ?? []) as Pick<QuoteLine, 'quote_id' | 'qty' | 'unit_price_twd'>[]) {
      const arr = byQuote.get(l.quote_id) ?? [];
      arr.push(l as QuoteLine);
      byQuote.set(l.quote_id, arr);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold" style={{ color: 'var(--nm-text-primary)' }}>報價系統</h1>
        <Link
          href="/boss/quotes/new"
          className="ml-auto nm-btn-solid text-[13px]"
        >
          新增報價單
        </Link>
      </div>

      <div className="rounded-2xl nm-raised overflow-x-auto overflow-y-auto">
        <table className="w-full text-[13px]" style={{ minWidth: 900, borderCollapse: 'collapse' }}>
          <thead style={{ background: 'rgba(20,20,24,0.92)' }}>
            <tr style={{ color: 'var(--nm-text-muted)' }}>
              <th className="text-left px-3 py-2 font-normal whitespace-nowrap">客戶</th>
              <th className="text-left px-3 py-2 font-normal whitespace-nowrap">案件</th>
              <th className="text-left px-3 py-2 font-normal whitespace-nowrap">狀態</th>
              <th className="text-right px-3 py-2 font-normal whitespace-nowrap">明細數</th>
              <th className="text-right px-3 py-2 font-normal whitespace-nowrap">總額</th>
              <th className="text-left px-3 py-2 font-normal whitespace-nowrap">建立日期</th>
            </tr>
          </thead>
          <tbody>
            {error && (
              <tr><td colSpan={6} className="px-3 py-4 whitespace-nowrap" style={{ color: 'var(--nm-danger)' }}>查詢失敗: {error.message}</td></tr>
            )}
            {!error && quotes.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>還沒有報價單</td></tr>
            )}
            {quotes.map((q) => {
              const lines = byQuote.get(q.id) ?? [];
              let missing = 0;
              let total = 0;
              for (const l of lines) {
                if (l.unit_price_twd === null || l.unit_price_twd === undefined) missing += 1;
                else total += l.qty * l.unit_price_twd;
              }
              return (
                <tr key={q.id} style={{ borderTop: '1px solid var(--nm-border-hair)' }}>
                  <td className="px-3 py-2 font-medium whitespace-nowrap">
                    <Link href={`/boss/quotes/${q.id}`} className="underline" style={{ color: 'var(--nm-text-body)' }}>
                      {q.client_name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>{q.project_name ?? '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={`nm-pill ${STATUS_STYLE[q.status]}`} style={STATUS_INLINE[q.status]}>
                      {QUOTE_STATUS_LABEL[q.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>{lines.length}</td>
                  <td className="px-3 py-2 text-right font-mono tabular whitespace-nowrap">
                    {lines.length === 0 ? (
                      <span style={{ color: 'var(--nm-text-muted)' }}>—</span>
                    ) : missing > 0 ? (
                      <span style={{ color: 'var(--nm-warning)' }}>{missing} 項待補價</span>
                    ) : (
                      <span style={{ color: 'var(--nm-text-body)' }}>${fmt(total)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>{q.created_at.slice(0, 10)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
