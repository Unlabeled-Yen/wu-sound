import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';
import { findPayrollBatchId, syncPayrollMonth } from '@/lib/payroll-sync-server';

export const runtime = 'nodejs';

const MONTH_RE = /^\d{4}-\d{2}$/;

// 獎金隨時可改,不分「鎖定前後」——這個月如果已經結算過(book_batches 存在),
// 存完獎金立刻同步,帳務分錄當場跟上;還沒結算過的月份只是存草稿,不主動
// 生出批次(那要老闆在月結中心明確按「送出結算」)。
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

  if (amount === 0) {
    const del = await sb.from('payroll_bonuses').delete().eq('batch_month', batchMonth).eq('user_id', userId);
    if (del.error) return NextResponse.json({ error: `刪除失敗: ${del.error.message}` }, { status: 500 });
  } else {
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
  }

  const batchId = await findPayrollBatchId(sb, month);
  if (batchId) {
    const sync = await syncPayrollMonth(sb, batchId, month, session.id);
    if (!sync.ok) return NextResponse.json({ error: `獎金已存,但同步到帳務失敗: ${sync.error}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, synced: batchId !== null });
}
