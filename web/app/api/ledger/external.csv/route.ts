import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';
import { LEDGER_KIND_LABEL, type LedgerEntry } from '@/lib/types';

export const runtime = 'nodejs';

function csvEscape(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });
  if (session.role !== 'boss') return NextResponse.json({ error: '權限不足' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    return NextResponse.json({ error: '缺少或錯誤的起日 from' }, { status: 400 });
  }
  if (!to || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: '缺少或錯誤的迄日 to' }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('ledger_entries')
    .select('*')
    .eq('is_external', true)
    .eq('status', 'active')
    .gte('occurred_on', from)
    .lte('occurred_on', to)
    .order('occurred_on', { ascending: true });
  if (error) return NextResponse.json({ error: `查詢失敗: ${error.message}` }, { status: 500 });

  const rows = (data ?? []) as LedgerEntry[];
  const header = ['日期', '方向', '類別', '對象', '金額', '稅額', '發票日期', '發票號', '備註'];
  const lines: string[] = [header.map(csvEscape).join(',')];
  for (const r of rows) {
    lines.push([
      r.occurred_on,
      r.direction === 'income' ? '收入' : '支出',
      LEDGER_KIND_LABEL[r.kind] ?? r.kind,
      r.party ?? '',
      r.amount_twd,
      r.tax_amount_twd,
      r.invoice_date ?? '',
      r.invoice_no ?? '',
      r.memo ?? '',
    ].map(csvEscape).join(','));
  }
  const body = '﻿' + lines.join('\r\n') + '\r\n';
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="external-${from}-${to}.csv"`,
    },
  });
}
