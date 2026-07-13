import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';
import { CATEGORY_LABEL, type ExpenseCategory } from '@/lib/types';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });

  let body: { category?: unknown; amount_twd?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求' }, { status: 400 });
  }

  const cat = body.category;
  if (cat !== 'fuel' && cat !== 'parking') {
    return NextResponse.json({ error: '分類需為加油或停車' }, { status: 400 });
  }
  const category = cat as ExpenseCategory;

  const amt =
    typeof body.amount_twd === 'number' && Number.isFinite(body.amount_twd)
      ? Math.round(body.amount_twd)
      : NaN;
  if (!Number.isFinite(amt) || amt <= 0 || amt > 9_999_999) {
    return NextResponse.json({ error: '請輸入正整數金額' }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const ins = await sb
    .from('expenses')
    .insert({
      user_id: session.id,
      source: 'app',
      status: 'draft',
      receipt_url: null,
      ai_draft: null,
      category,
      amount_twd: amt,
      item_text: CATEGORY_LABEL[category],
    })
    .select('id')
    .single();

  if (ins.error || !ins.data) {
    return NextResponse.json(
      { error: `建立草稿失敗: ${ins.error?.message ?? 'unknown'}` },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, id: ins.data.id });
}
