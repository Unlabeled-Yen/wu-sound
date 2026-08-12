import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';
import { CATEGORY_LABEL, type ExpenseCategory } from '@/lib/types';
import { pushMessageBestEffort, textMessage } from '@/lib/line';

export const runtime = 'nodejs';

const CATS: ExpenseCategory[] = ['fuel', 'parking', 'materials', 'other'];

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });

  let body: {
    spent_on?: unknown;
    category?: unknown;
    amount_twd?: unknown;
    item_text?: unknown;
    site_id?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求' }, { status: 400 });
  }

  const spent = typeof body.spent_on === 'string' ? body.spent_on : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(spent)) {
    return NextResponse.json({ error: '日期格式錯誤' }, { status: 400 });
  }
  const cat = body.category;
  if (typeof cat !== 'string' || !CATS.includes(cat as ExpenseCategory)) {
    return NextResponse.json({ error: '分類無效' }, { status: 400 });
  }
  const amt =
    typeof body.amount_twd === 'number' && Number.isFinite(body.amount_twd)
      ? Math.round(body.amount_twd)
      : NaN;
  if (!Number.isFinite(amt) || amt <= 0 || amt > 9_999_999) {
    return NextResponse.json({ error: '金額必須為正整數' }, { status: 400 });
  }
  const item = typeof body.item_text === 'string' ? body.item_text.trim() : '';
  if (!item) {
    return NextResponse.json({ error: '請填品項' }, { status: 400 });
  }
  const siteId = typeof body.site_id === 'string' && body.site_id ? body.site_id : null;

  const sb = getSupabaseAdmin();
  const cur = await sb
    .from('expenses')
    .select('*')
    .eq('id', id)
    .eq('user_id', session.id)
    .maybeSingle();
  if (cur.error) {
    return NextResponse.json({ error: `查詢失敗: ${cur.error.message}` }, { status: 500 });
  }
  if (!cur.data) return NextResponse.json({ error: '找不到記錄' }, { status: 404 });
  if (cur.data.status !== 'draft') {
    return NextResponse.json({ error: '此筆已送出或已處理' }, { status: 409 });
  }

  const before = {
    spent_on: cur.data.spent_on,
    category: cur.data.category,
    amount_twd: cur.data.amount_twd,
    item_text: cur.data.item_text,
    site_id: cur.data.site_id,
    status: cur.data.status,
  };
  const after = {
    spent_on: spent,
    category: cat,
    amount_twd: amt,
    item_text: item,
    site_id: siteId,
    status: 'submitted' as const,
  };

  const upd = await sb.from('expenses').update(after).eq('id', id).eq('user_id', session.id);
  if (upd.error) {
    return NextResponse.json({ error: `送出失敗: ${upd.error.message}` }, { status: 500 });
  }

  await sb.from('audit_log').insert({
    actor_id: session.id,
    action: 'submit',
    target_table: 'expenses',
    target_id: id,
    diff: { before, after },
  });

  // 推播老闆 LINE——最佳努力,失敗不影響送出本身(通知是錦上添花,不是主流程)
  const { data: bosses } = await sb
    .from('users')
    .select('line_user_id')
    .eq('role', 'boss')
    .eq('active', true)
    .not('line_user_id', 'is', null);
  const amountFmt = amt.toLocaleString('zh-TW');
  const notifyText = `${session.name} 送出一筆零用金待審\n${CATEGORY_LABEL[cat as ExpenseCategory]} · $${amountFmt}\n${item}\n\n到系統「零用金管理」審核`;
  for (const boss of bosses ?? []) {
    await pushMessageBestEffort(boss.line_user_id, [textMessage(notifyText)]);
  }

  return NextResponse.json({ ok: true });
}
