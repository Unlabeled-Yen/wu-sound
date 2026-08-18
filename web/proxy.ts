import { NextResponse, type NextRequest } from 'next/server';
import { canAccessPagePath } from '@/lib/acl';

const COOKIE_NAME = 'sess';

interface SessionPayload {
  id: string;
  name: string;
  role: 'boss' | 'staff';
  exp: number;
}

function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verify(raw: string, secret: string): Promise<SessionPayload | null> {
  const idx = raw.indexOf('.');
  if (idx < 0) return null;
  const payloadB64 = raw.slice(0, idx);
  const sig = raw.slice(idx + 1);
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const macBuf = await crypto.subtle.sign('HMAC', key, enc.encode(payloadB64));
  const expected = bytesToB64url(macBuf);
  if (!timingSafeEqualStr(sig, expected)) return null;
  try {
    const payloadBytes = b64urlToBytes(payloadB64);
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as SessionPayload;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!payload.id || !payload.role) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const needsAuth = pathname.startsWith('/staff') || pathname.startsWith('/boss');
  if (!needsAuth) return NextResponse.next();

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  const raw = req.cookies.get(COOKIE_NAME)?.value;
  const session = raw ? await verify(raw, secret) : null;
  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // /boss/* 現在是老闆與員工共用的路由(員工桌面版複用同一套殼層,見
  // docs/desktop-lock-and-staff-access-spec-v1.md §8)。這裡不再整段擋員工,
  // 改成跟 app/boss 底下每支頁面一致的能力表判斷——這層是 Edge middleware,
  // 在頁面渲染之前就先擋掉禁區(財務/標案/使用者管理),沒被這裡擋到的
  // 才會走到頁面自己的 requirePageCapability 覆核。兩層用同一份 lib/acl.ts,
  // 不會不同步。
  if (pathname.startsWith('/boss') && !canAccessPagePath(session.role, pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = '/boss';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/staff/:path*', '/boss/:path*'],
};
