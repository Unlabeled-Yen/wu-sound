import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { Quote, QuoteLine } from '@/lib/types';
import { computeQuoteTotals } from '@/lib/quote-calc';

export const runtime = 'nodejs';

function csvEscape(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });
  if (session.role !== 'boss') return NextResponse.json({ error: '權限不足' }, { status: 403 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });

  const sb = getSupabaseAdmin();
  const q = await sb.from('quotes').select('*').eq('id', id).maybeSingle();
  if (q.error) return NextResponse.json({ error: `查詢失敗: ${q.error.message}` }, { status: 500 });
  if (!q.data) return NextResponse.json({ error: '找不到報價單' }, { status: 404 });
  const quote = q.data as Quote;

  const l = await sb
    .from('quote_lines')
    .select('*')
    .eq('quote_id', id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (l.error) return NextResponse.json({ error: `查詢失敗: ${l.error.message}` }, { status: 500 });
  const lines = (l.data ?? []) as QuoteLine[];

  const header = ['序列', '名稱', '規格', '數量', '單位', '單價', '小計'];
  const out: string[] = [header.map(csvEscape).join(',')];

  let total = 0;
  let missing = 0;
  lines.forEach((line, i) => {
    const hasPrice = line.unit_price_twd !== null && line.unit_price_twd !== undefined;
    let subtotalCell: string;
    let priceCell: string;
    if (hasPrice) {
      const subtotal = line.qty * (line.unit_price_twd as number);
      total += subtotal;
      priceCell = String(line.unit_price_twd);
      subtotalCell = String(subtotal);
    } else {
      missing += 1;
      priceCell = '待設定';
      subtotalCell = '待設定';
    }
    out.push([
      i + 1,
      line.name,
      line.spec ?? '',
      line.qty,
      line.unit ?? '',
      priceCell,
      subtotalCell,
    ].map(csvEscape).join(','));
  });

  if (missing > 0) {
    out.push(['', `尚有 ${missing} 項待設定售價`, '', '', '', '', ''].map(csvEscape).join(','));
  } else {
    // 跟列印頁/編輯頁用同一個函式算稅額,CSV 的「總計」以前只加總品項小計、
    // 沒套用 tax_rate,金額會比畫面上顯示的「總價」少稅額那一塊。
    const { tax, grandTotal } = computeQuoteTotals(
      { equipmentSubtotal: total, installSubtotal: 0, equipment: [], install: [], missingCount: 0 },
      quote.tax_rate,
    );
    out.push(['', '小計', '', '', '', '', String(total)].map(csvEscape).join(','));
    out.push(['', `稅額(稅率 ${quote.tax_rate})`, '', '', '', '', String(tax)].map(csvEscape).join(','));
    out.push(['', '總計(含稅)', '', '', '', '', String(grandTotal)].map(csvEscape).join(','));
  }

  const safeClient = (quote.client_name || 'quote').replace(/[^\w一-龥-]/g, '_');
  const body = '﻿' + out.join('\r\n') + '\r\n';
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="quote-${safeClient}-${id.slice(0, 8)}.csv"`,
    },
  });
}
