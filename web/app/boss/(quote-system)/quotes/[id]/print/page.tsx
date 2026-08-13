import { redirect } from 'next/navigation';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { Quote, QuoteLine } from '@/lib/types';
import { computeQuoteTotals, groupQuoteLines } from '@/lib/quote-calc';
import PrintToolbar from './PrintToolbar';

export const dynamic = 'force-dynamic';

const fmt = (n: number) => n.toLocaleString('zh-TW');

interface UserRow { name: string }

export default async function QuotePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = getSupabaseAdmin();

  const q = await sb.from('quotes').select('*').eq('id', id).maybeSingle();
  if (q.error || !q.data) redirect('/boss/quotes');
  const quote = q.data as Quote;

  const l = await sb
    .from('quote_lines')
    .select('*')
    .eq('quote_id', id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  const lines = (l.data ?? []) as QuoteLine[];

  const u = await sb.from('users').select('name').eq('id', quote.created_by).maybeSingle();
  const reporterName = (u.data as UserRow | null)?.name ?? '—';

  const groups = groupQuoteLines(lines);
  const totals = computeQuoteTotals(groups, quote.tax_rate);
  const missing = groups.missingCount;

  return (
    <div style={{ background: '#fff', color: '#1a1a1a', minHeight: '100vh' }}>
      <style>{`
        body::before, body::after { display: none !important; }
        @media print {
          @page { size: A4; margin: 14mm; }
          .print-hide { display: none !important; }
          body { background: #fff !important; }
        }
      `}</style>

      <PrintToolbar quoteId={quote.id} />

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px 48px', fontSize: 14, lineHeight: 1.6 }}>
        {missing > 0 && (
          <div
            style={{
              border: '2px solid #c0392b',
              background: '#fdecea',
              color: '#c0392b',
              borderRadius: 8,
              padding: '12px 16px',
              marginBottom: 20,
              fontWeight: 600,
            }}
          >
            尚有 {missing} 項未設定售價,本報價單金額不完整,請勿對外提供
          </div>
        )}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/quote-logo.png" alt="SOUND SOUND audio" style={{ width: '100%', display: 'block', marginBottom: 20 }} />

        <div style={{ marginBottom: 16 }}>
          <div>客戶名稱:{quote.client_name}</div>
          <div>內容:{quote.project_name ?? '—'}</div>
        </div>

        <QuoteSection title="器材" rows={groups.equipment} subtotal={groups.equipmentSubtotal} />
        <QuoteSection title="安裝" rows={groups.install} subtotal={groups.installSubtotal} />

        {missing === 0 && (
          <div style={{ marginTop: 12, marginBottom: 24 }}>
            <TotalsRow label="Total" value={totals.total} />
            <TotalsRow label={`營業稅 ${(quote.tax_rate * 100).toFixed(1)}%`} value={totals.tax} />
            <TotalsRow label="總價" value={totals.grandTotal} bold />
          </div>
        )}

        <div style={{ marginTop: 32, borderTop: '1px solid #ccc', paddingTop: 16, whiteSpace: 'pre-line', color: '#333' }}>
          {`報價人:${reporterName}
聯絡電話:0980113860
1.安裝工期約五個工作天
2.以上設備均為台灣公司貨,均為五年保固。
3.此報價單期限為1個月。
4.簽約付訂即可享有此優惠價格,(訂金為總價30%),剩餘款項可以分12期付款。
5.下訂即享有保養檢修主堂音響系統免費服務(隔年)。
6.完工後,即提供音控控程師到場四次主日音控服務(免費)。`}
        </div>
      </div>
    </div>
  );
}

function QuoteSection({ title, rows, subtotal }: { title: string; rows: QuoteLine[]; subtotal: number }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontWeight: 700, fontSize: 15, margin: '12px 0 6px' }}>{title}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #999' }}>
            <th style={thStyle('left', 36)}>序列</th>
            <th style={thStyle('left')}>名稱</th>
            <th style={thStyle('left')}>規格</th>
            <th style={thStyle('right', 48)}>數量</th>
            <th style={thStyle('left', 48)}>單位</th>
            <th style={thStyle('right', 80)}>單價</th>
            <th style={thStyle('right', 80)}>小計</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={7} style={{ padding: '8px 4px', color: '#888', textAlign: 'center' }}>無項目</td></tr>
          )}
          {rows.map((line, i) => (
            <tr key={line.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={tdStyle('left')}>{i + 1}</td>
              <td style={tdStyle('left')}>{line.name}</td>
              <td style={tdStyle('left')}>{line.spec ?? '—'}</td>
              <td style={tdStyle('right')}>{line.qty}</td>
              <td style={tdStyle('left')}>{line.unit ?? '—'}</td>
              <td style={tdStyle('right')}>{line.unit_price_twd !== null ? `$${fmt(line.unit_price_twd)}` : '待設定'}</td>
              <td style={tdStyle('right')}>
                {line.unit_price_twd !== null ? `$${fmt(line.qty * line.unit_price_twd)}` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ textAlign: 'right', marginTop: 4, fontWeight: 600 }}>{title}小計:${fmt(subtotal)}</div>
    </div>
  );
}

function TotalsRow({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '4px 0',
        fontWeight: bold ? 700 : 400,
        fontSize: bold ? 18 : 14,
      }}
    >
      <span>{label}</span>
      <span>${fmt(value)}</span>
    </div>
  );
}

function thStyle(align: 'left' | 'right', width?: number): React.CSSProperties {
  return { textAlign: align, padding: '6px 4px', fontWeight: 600, width };
}
function tdStyle(align: 'left' | 'right'): React.CSSProperties {
  return { textAlign: align, padding: '6px 4px' };
}
