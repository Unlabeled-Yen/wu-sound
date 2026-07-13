import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';
import { CATEGORY_LABEL, type ExpenseRecord } from '@/lib/types';

export const runtime = 'nodejs';

interface Joined extends ExpenseRecord {
  users?: { name?: string };
  sites?: { name?: string } | null;
}

function csvEscape(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ month: string }> },
) {
  const { month } = await params;
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: '月份格式錯誤' }, { status: 400 });
  }
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });
  if (session.role !== 'boss') {
    return NextResponse.json({ error: '權限不足' }, { status: 403 });
  }

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('expenses')
    .select('*, users!inner(name), sites(name)')
    .eq('status', 'confirmed');
  if (error) {
    return NextResponse.json({ error: `查詢失敗: ${error.message}` }, { status: 500 });
  }

  const rows = ((data ?? []) as unknown as Joined[])
    .filter((r) => {
      const src = r.spent_on ?? r.captured_at;
      return String(src).slice(0, 7) === month;
    })
    .sort((a, b) => {
      const na = a.users?.name ?? '';
      const nb = b.users?.name ?? '';
      if (na !== nb) return na < nb ? -1 : 1;
      const da = a.spent_on ?? String(a.captured_at).slice(0, 10);
      const db = b.spent_on ?? String(b.captured_at).slice(0, 10);
      return da < db ? -1 : da > db ? 1 : 0;
    });

  const header = ['姓名', '日期', '分類', '品項', '案場', '金額'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        csvEscape(r.users?.name ?? ''),
        csvEscape(r.spent_on ?? ''),
        csvEscape(r.category ? CATEGORY_LABEL[r.category] : ''),
        csvEscape(r.item_text ?? ''),
        csvEscape(r.sites?.name ?? ''),
        csvEscape(r.amount_twd ?? 0),
      ].join(','),
    );
  }

  const body = '﻿' + lines.join('\r\n') + '\r\n';
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="close-${month}.csv"`,
    },
  });
}
