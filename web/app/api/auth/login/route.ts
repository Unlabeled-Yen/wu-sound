import { NextResponse } from 'next/server';
import { verifyPin } from '@/lib/auth';
import { createSession } from '@/lib/session';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let body: { name?: unknown; pin?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求' }, { status: 400 });
  }
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const pin = typeof body.pin === 'string' ? body.pin : '';
  if (!name || !/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: '請輸入姓名與 4 位數 PIN' }, { status: 400 });
  }

  const user = await verifyPin(name, pin);
  if (!user) {
    return NextResponse.json({ error: 'PIN 錯誤,請重試' }, { status: 401 });
  }

  await createSession(user);
  return NextResponse.json({ ok: true, role: user.role });
}
