import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/supabase';
import { type Quote, type QuoteLine } from '@/lib/types';
import { QuoteCountCards, type CountCardData } from './QuoteCountCards';
import { QuoteListRow, type QuoteRowData } from './QuoteListRow';

export const dynamic = 'force-dynamic';

const fmt = (n: number) => n.toLocaleString('zh-TW');
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

type FilterKey = 'missing' | 'draft' | 'sent' | 'won';

export default async function QuotesPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const sp = (await searchParams) ?? {};
  const filter = (['missing', 'draft', 'sent', 'won'] as const).includes(sp.filter as FilterKey) ? (sp.filter as FilterKey) : null;

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

  const rows: QuoteRowData[] = quotes.map((q) => {
    const lines = byQuote.get(q.id) ?? [];
    let missing = 0;
    let total = 0;
    for (const l of lines) {
      if (l.unit_price_twd === null || l.unit_price_twd === undefined) missing += 1;
      else total += l.qty * l.unit_price_twd;
    }
    return { quote: q, lineCount: lines.length, missing, total };
  });

  // 分組順序＝該不該動它:待補價(擋住送出)→ 草稿 → 已送出 → 終態(成交/未成交)。
  const missingRows = rows.filter((r) => r.missing > 0);
  const draftRows = rows.filter((r) => r.missing === 0 && r.quote.status === 'draft');
  const sentRows = rows.filter((r) => r.quote.status === 'sent');
  const terminalRows = rows.filter((r) => r.quote.status === 'won' || r.quote.status === 'lost');

  const wonRows = rows.filter((r) => r.quote.status === 'won');
  const won90 = wonRows.filter((r) => {
    const at = r.quote.won_at;
    if (!at) return false; // 沒有 won_at 的舊資料不算「近 90 天」——不能用 updated_at 頂替猜天數。
    return Date.now() - new Date(at).getTime() <= NINETY_DAYS_MS;
  });
  const won90Total = won90.reduce((s, r) => s + r.total, 0);

  const cards: CountCardData[] = [
    { key: 'missing', label: '待補價', count: missingRows.length, suffix: '張擋著', tone: 'warning' },
    { key: 'draft', label: '草稿', count: draftRows.length, tone: 'neutral' },
    { key: 'sent', label: '已送出待回覆', count: sentRows.length, tone: 'neutral' },
    { key: 'won', label: '近 90 天成交', count: won90.length, suffix: `張 · $${won90Total >= 1000000 ? `${(won90Total / 1000000).toFixed(1)}M` : fmt(won90Total)}`, tone: 'success' },
  ];

  const groups: { key: FilterKey; title: string; hint: string; rows: QuoteRowData[] }[] = [
    { key: 'missing', title: '待補價', hint: '先處理這些', rows: missingRows },
    { key: 'draft', title: '草稿', hint: '', rows: draftRows },
    { key: 'sent', title: '已送出', hint: '等客戶回覆', rows: sentRows },
    { key: 'won', title: '終態', hint: '成交／未成交', rows: terminalRows },
  ];
  const visibleGroups = filter ? groups.filter((g) => g.key === filter) : groups;
  const inProgressCount = draftRows.length + sentRows.length + missingRows.length;

  return (
    <div>
      <div className="flex items-end justify-between gap-3 flex-wrap mb-6">
        <div>
          <h1 className="text-[22px] font-semibold mb-2.5" style={{ color: 'var(--nm-text-primary)' }}>報價系統</h1>
          <div className="text-[12.5px]" style={{ color: 'var(--nm-text-muted)' }}>{quotes.length} 張報價單　·　進行中 {inProgressCount} 張</div>
        </div>
        <Link href="/boss/quotes/new" className="nm-btn-solid text-[13px]">＋ 新增報價單</Link>
      </div>

      <QuoteCountCards cards={cards} activeFilter={filter} baseHref="/boss/quotes" />

      {error && (
        <div className="rounded-2xl px-4 py-3 text-[13px]" style={{ background: 'rgba(224,122,122,0.08)', border: '1px solid rgba(224,122,122,0.34)', color: 'var(--nm-danger-glass-text)' }}>
          查詢失敗:{error.message}
        </div>
      )}

      {!error && quotes.length === 0 && (
        <div className="py-10 text-center text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>還沒有報價單</div>
      )}

      {!error && visibleGroups.map((g) => g.rows.length > 0 && (
        <div key={g.key} className="mb-2">
          <div
            className="sticky top-0 z-10 text-[11px] uppercase tracking-[.14em] py-3"
            style={{ color: 'var(--nm-text-muted)', borderBottom: '1px solid rgba(255,255,255,.14)', background: 'var(--nm-bg)' }}
          >
            {g.title}{g.hint && <>　—　{g.hint}</>}
          </div>
          <div>
            {g.rows.map((r) => <QuoteListRow key={r.quote.id} row={r} />)}
          </div>
        </div>
      ))}

      {!filter && quotes.length > 0 && (
        <div className="pt-5 text-[12px] leading-[1.8]" style={{ color: 'var(--nm-text-faint)' }}>
          分組順序＝該不該動它:待補價(擋住送出)→ 草稿 → 已送出 → 終態。金額欄固定在同一位置、等寬數字靠右,狀態用單一 pill,不再需要橫向捲動。
        </div>
      )}
    </div>
  );
}
