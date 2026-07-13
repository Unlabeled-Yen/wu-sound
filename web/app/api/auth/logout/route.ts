import { NextResponse } from 'next/server';
import { destroySession } from '@/lib/session';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  await destroySession();
  const url = new URL('/login', req.url);
  return NextResponse.redirect(url, { status: 303 });
}
