import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { ExpenseRecord } from '@/lib/types';

export const runtime = 'nodejs';

interface Joined extends ExpenseRecord {
  users?: { name?: string };
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });
  if (session.role !== 'boss') {
    return NextResponse.json({ error: '權限不足' }, { status: 403 });
  }

  let body: { month?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求' }, { status: 400 });
  }
  const month = typeof body.month === 'string' ? body.month : '';
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: '月份格式錯誤' }, { status: 400 });
  }

  const sb = getSupabaseAdmin();

  // Re-check drafts/submitted for this month = 0
  const { data: pendData, error: pendErr } = await sb
    .from('expenses')
    .select('id, status, spent_on, captured_at')
    .in('status', ['draft', 'submitted']);
  if (pendErr) {
    return NextResponse.json({ error: `查詢失敗: ${pendErr.message}` }, { status: 500 });
  }
  const pendingCount = (pendData ?? []).filter((r) => {
    const src = (r.spent_on as string | null) ?? (r.captured_at as string);
    return String(src).slice(0, 7) === month;
  }).length;
  if (pendingCount > 0) {
    return NextResponse.json(
      { error: `尚有 ${pendingCount} 筆未處理,無法結算` },
      { status: 409 },
    );
  }

  // Fetch confirmed for month
  const { data: confData, error: confErr } = await sb
    .from('expenses')
    .select('*, users!inner(name)')
    .eq('status', 'confirmed');
  if (confErr) {
    return NextResponse.json({ error: `查詢失敗: ${confErr.message}` }, { status: 500 });
  }
  const confirmed = ((confData ?? []) as unknown as Joined[]).filter((r) => {
    const src = r.spent_on ?? r.captured_at;
    return String(src).slice(0, 7) === month;
  });
  if (confirmed.length === 0) {
    return NextResponse.json({ error: '本月無已確認代墊,無需結算' }, { status: 400 });
  }

  const totalsMap = new Map<string, { name: string; total: number; count: number }>();
  for (const r of confirmed) {
    const cur = totalsMap.get(r.user_id) ?? {
      name: r.users?.name ?? '?',
      total: 0,
      count: 0,
    };
    cur.total += r.amount_twd ?? 0;
    cur.count += 1;
    totalsMap.set(r.user_id, cur);
  }
  const totals = Object.fromEntries(
    Array.from(totalsMap.entries()).map(([uid, v]) => [uid, v]),
  );

  // Create batch (month = first day of month)
  const monthDate = `${month}-01`;
  const batchIns = await sb
    .from('book_batches')
    .insert({ month: monthDate, created_by: session.id, totals })
    .select('id')
    .single();
  if (batchIns.error || !batchIns.data) {
    const msg = batchIns.error?.message ?? 'unknown';
    if (/duplicate|unique/i.test(msg)) {
      return NextResponse.json({ error: '此月份已鎖定過' }, { status: 409 });
    }
    return NextResponse.json({ error: `建立薪資結算批次失敗: ${msg}` }, { status: 500 });
  }
  const batchId = batchIns.data.id as string;

  const ids = confirmed.map((r) => r.id);
  const upd = await sb
    .from('expenses')
    .update({ status: 'booked', booked_batch_id: batchId })
    .in('id', ids)
    .eq('status', 'confirmed');
  if (upd.error) {
    return NextResponse.json(
      { error: `鎖定明細失敗: ${upd.error.message}` },
      { status: 500 },
    );
  }

  await sb.from('audit_log').insert({
    actor_id: session.id,
    action: 'close_month',
    target_table: 'book_batches',
    target_id: batchId,
    diff: { month, count: confirmed.length, totals },
  });

  return NextResponse.json({ ok: true, batch_id: batchId, count: confirmed.length });
}
