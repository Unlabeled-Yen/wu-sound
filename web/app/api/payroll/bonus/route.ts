import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

const MONTH_RE = /^\d{4}-\d{2}$/;

// 獎金鎖定前可改(upsert),鎖定後(該月已有 book_batches)一律唯讀——
// 已經轉成 ledger_entries 的獎金不能再從這裡動,要改要走帳務本身的作廢/改分錄。
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });
  if (session.role !== 'boss') return NextResponse.json({ error: '權限不足' }, { status: 403 });

  let body: { user_id?: unknown; month?: unknown; amount_twd?: unknown; memo?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求' }, { status: 400 });
  }

  const userId = typeof body.user_id === 'string' ? body.user_id : '';
  const month = typeof body.month === 'string' ? body.month : '';
  const amount = body.amount_twd === null || body.amount_twd === undefined || body.amount_twd === '' ? 0 : Number(body.amount_twd);
  const memo = typeof body.memo === 'string' ? body.memo.trim() || null : null;

  if (!userId) return NextResponse.json({ error: '缺少 user_id' }, { status: 400 });
  if (!MONTH_RE.test(month)) return NextResponse.json({ error: '月份格式錯誤' }, { status: 400 });
  if (!Number.isInteger(amount) || amount < 0) return NextResponse.json({ error: '獎金金額必須為非負整數' }, { status: 400 });

  const batchMonth = `${month}-01`;
  const sb = getSupabaseAdmin();

  const locked = await sb.from('book_batches').select('id').eq('month', batchMonth).maybeSingle();
  if (locked.error) return NextResponse.json({ error: `查詢失敗: ${locked.error.message}` }, { status: 500 });
  if (locked.data) return NextResponse.json({ error: '這個月已經鎖定,獎金不能再改' }, { status: 409 });

  if (amount === 0) {
    const del = await sb.from('payroll_bonuses').delete().eq('batch_month', batchMonth).eq('user_id', userId);
    if (del.error) return NextResponse.json({ error: `刪除失敗: ${del.error.message}` }, { status: 500 });
    return NextResponse.json({ row: null });
  }

  const upsert = await sb
    .from('payroll_bonuses')
    .upsert(
      { batch_month: batchMonth, user_id: userId, amount_twd: amount, memo, created_by: session.id },
      { onConflict: 'batch_month,user_id' },
    )
    .select('*')
    .single();

  if (upsert.error || !upsert.data) {
    return NextResponse.json({ error: `儲存失敗: ${upsert.error?.message ?? 'unknown'}` }, { status: 500 });
  }

  return NextResponse.json({ row: upsert.data });
}
