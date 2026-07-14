import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/supabase';
import { QUOTE_STATUS_LABEL, type Quote, type QuoteLine, type QuoteStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

const fmt = (n: number) => n.toLocaleString('zh-TW');

const STATUS_STYLE: Record<QuoteStatus, string> = {
  draft: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
  sent: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  won: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  lost: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
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
        <h1 className="text-xl font-semibold">報價單</h1>
        <Link
          href="/boss/quotes/new"
          className="ml-auto px-4 py-2 rounded bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
        >
          新增報價單
        </Link>
      </div>

      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-x-auto bg-white dark:bg-neutral-900">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-950 text-neutral-500">
            <tr>
              <th className="text-left px-3 py-2">客戶</th>
              <th className="text-left px-3 py-2">案件</th>
              <th className="text-left px-3 py-2">狀態</th>
              <th className="text-right px-3 py-2">明細數</th>
              <th className="text-right px-3 py-2">總額</th>
              <th className="text-left px-3 py-2">建立日期</th>
            </tr>
          </thead>
          <tbody>
            {error && (
              <tr><td colSpan={6} className="px-3 py-4 text-red-600">查詢失敗: {error.message}</td></tr>
            )}
            {!error && quotes.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-neutral-500">還沒有報價單</td></tr>
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
                <tr key={q.id} className="border-t border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                  <td className="px-3 py-2 font-medium">
                    <Link href={`/boss/quotes/${q.id}`} className="text-blue-600 dark:text-blue-400 underline">
                      {q.client_name}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{q.project_name ?? '—'}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${STATUS_STYLE[q.status]}`}>
                      {QUOTE_STATUS_LABEL[q.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">{lines.length}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {lines.length === 0 ? (
                      <span className="text-neutral-400">—</span>
                    ) : missing > 0 ? (
                      <span className="text-amber-600 dark:text-amber-400">{missing} 項待補價</span>
                    ) : (
                      `$${fmt(total)}`
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{q.created_at.slice(0, 10)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
