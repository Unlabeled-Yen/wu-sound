import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// 改月薪 = 新增一筆新生效日紀錄,不覆寫舊的——歷史月份的月結重算要用當時
// 生效的金額,見 lib/payroll.ts 的生效日期制說明。
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });
  if (session.role !== 'boss') return NextResponse.json({ error: '權限不足' }, { status: 403 });

  let body: { user_id?: unknown; monthly_salary_twd?: unknown; effective_from?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求' }, { status: 400 });
  }

  const userId = typeof body.user_id === 'string' ? body.user_id : '';
  const salary = Number(body.monthly_salary_twd);
  const effectiveFrom = typeof body.effective_from === 'string' ? body.effective_from : '';

  if (!userId) return NextResponse.json({ error: '缺少 user_id' }, { status: 400 });
  if (!Number.isInteger(salary) || salary <= 0) return NextResponse.json({ error: '月薪必須為正整數' }, { status: 400 });
  if (!DATE_RE.test(effectiveFrom)) return NextResponse.json({ error: '生效日期格式錯誤' }, { status: 400 });

  const sb = getSupabaseAdmin();
  const ins = await sb
    .from('user_pay_profiles')
    .insert({ user_id: userId, monthly_salary_twd: salary, effective_from: effectiveFrom, created_by: session.id })
    .select('*')
    .single();

  if (ins.error || !ins.data) {
    const msg = ins.error?.message ?? 'unknown';
    if (/duplicate|unique/i.test(msg)) {
      return NextResponse.json({ error: '這個人在這個生效日已經有一筆月薪設定了' }, { status: 409 });
    }
    return NextResponse.json({ error: `設定失敗: ${msg}` }, { status: 500 });
  }

  await sb.from('audit_log').insert({
    actor_id: session.id,
    action: 'payroll.pay_profile',
    target_table: 'user_pay_profiles',
    target_id: ins.data.id,
    diff: { user_id: userId, monthly_salary_twd: salary, effective_from: effectiveFrom },
  });

  return NextResponse.json({ row: ins.data });
}
