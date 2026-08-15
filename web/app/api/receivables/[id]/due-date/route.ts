import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// 只改 agreed_due_date,不動其他欄位——舊約定(金額/對象/專案)一旦結清或部分結清,
// 改掉會讓已經核對過的數字跟稽核紀錄對不上。約定日期不影響金額,補登風險低,
// 所以只開放這一個欄位可編輯。
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });
  if (session.role !== 'boss') return NextResponse.json({ error: '權限不足' }, { status: 403 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });

  let body: { agreed_due_date?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求' }, { status: 400 });
  }
  const agreedDueDate = body.agreed_due_date === null || body.agreed_due_date === undefined ? null : String(body.agreed_due_date);
  if (agreedDueDate !== null && !DATE_RE.test(agreedDueDate)) {
    return NextResponse.json({ error: '約定日期格式錯誤' }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const cur = await sb.from('receivables').select('id, agreed_due_date').eq('id', id).maybeSingle();
  if (cur.error) return NextResponse.json({ error: `查詢失敗: ${cur.error.message}` }, { status: 500 });
  if (!cur.data) return NextResponse.json({ error: '找不到記錄' }, { status: 404 });

  const upd = await sb.from('receivables').update({ agreed_due_date: agreedDueDate }).eq('id', id).select('*').single();
  if (upd.error || !upd.data) {
    return NextResponse.json({ error: `更新失敗: ${upd.error?.message ?? 'unknown'}` }, { status: 500 });
  }

  await sb.from('audit_log').insert({
    actor_id: session.id,
    action: 'receivable.due_date',
    target_table: 'receivables',
    target_id: id,
    diff: { before: cur.data.agreed_due_date, after: agreedDueDate },
  });

  return NextResponse.json({ row: upd.data });
}
