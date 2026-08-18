import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';
import { can } from '@/lib/acl';

export const runtime = 'nodejs';

function csvEscape(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });
  if (!can(session.role, 'ops')) return NextResponse.json({ error: '無權限' }, { status: 403 });

  const url = new URL(req.url);
  const monthParam = url.searchParams.get('month');
  const now = new Date();
  const ym =
    monthParam && /^\d{4}-\d{2}$/.test(monthParam)
      ? monthParam
      : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [y, m] = ym.split('-').map((x) => parseInt(x, 10));
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('clockins')
    .select('ts, type, is_backfill, backfill_reason, users(name)')
    .gte('ts', start.toISOString())
    .lt('ts', end.toISOString())
    .order('ts', { ascending: true });
  // 匯出跟月表頁面同一條界線:員工只能匯出自己的,見 app/boss/clockins/page.tsx。
  if (session.role !== 'boss') query = query.eq('user_id', session.id);
  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: `讀取打卡失敗: ${error.message}` }, { status: 500 });
  }

  const lines: string[] = ['姓名,日期,類型,時間,是否補登,補登原因'];
  for (const r of data || []) {
    const usersField = (r as { users: { name: string } | { name: string }[] | null }).users;
    const name = Array.isArray(usersField)
      ? usersField[0]?.name || ''
      : usersField?.name || '';
    const d = new Date(r.ts);
    const typeLabel = r.type === 'in' ? '上班' : '下班';
    const backfillLabel = r.is_backfill ? '是' : '否';
    const reason = r.backfill_reason || '';
    lines.push(
      [
        csvEscape(name),
        csvEscape(fmtDate(d)),
        csvEscape(typeLabel),
        csvEscape(fmtTime(d)),
        csvEscape(backfillLabel),
        csvEscape(reason),
      ].join(',')
    );
  }

  const body = '﻿' + lines.join('\r\n') + '\r\n';
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="clockins-${ym}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
