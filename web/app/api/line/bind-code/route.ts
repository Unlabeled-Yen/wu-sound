import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

const TTL_MS = 10 * 60_000;

function randomCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });

  const sb = getSupabaseAdmin();

  const { data: user, error: userErr } = await sb
    .from('users')
    .select('line_user_id')
    .eq('id', session.id)
    .maybeSingle();
  if (userErr) return NextResponse.json({ error: `查詢失敗: ${userErr.message}` }, { status: 500 });
  if (user?.line_user_id) {
    return NextResponse.json({ error: '已經綁定過 LINE 了,如需重新綁定請聯絡管理者' }, { status: 409 });
  }

  const expiresAt = new Date(Date.now() + TTL_MS).toISOString();

  // 碼是 primary key,萬一撞號重試幾次
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = randomCode();
    const { error } = await sb.from('line_bind_codes').insert({
      code,
      user_id: session.id,
      expires_at: expiresAt,
    });
    if (!error) {
      return NextResponse.json({ ok: true, code, expires_in_seconds: TTL_MS / 1000 });
    }
    if (error.code !== '23505') {
      // 非「主鍵重複」的錯誤,直接回報,不要靜默重試蓋掉真正的問題
      return NextResponse.json({ error: `產生綁定碼失敗: ${error.message}` }, { status: 500 });
    }
  }
  return NextResponse.json({ error: '產生綁定碼失敗,請再試一次' }, { status: 500 });
}
