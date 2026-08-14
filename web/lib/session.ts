import 'server-only';
import { createHmac, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import type { SessionUser } from './types';
import { getSupabaseAdmin } from './supabase';

const COOKIE_NAME = 'sess';
const TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days

interface SessionPayload extends SessionUser {
  exp: number; // unix seconds
}

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('SESSION_SECRET not configured (min 16 chars)');
  }
  return secret;
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function sign(payloadB64: string): string {
  const mac = createHmac('sha256', getSecret()).update(payloadB64).digest();
  return b64urlEncode(mac);
}

export async function createSession(user: SessionUser): Promise<void> {
  const payload: SessionPayload = {
    id: user.id,
    name: user.name,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + TTL_SECONDS,
  };
  const payloadB64 = b64urlEncode(Buffer.from(JSON.stringify(payload), 'utf8'));
  const sig = sign(payloadB64);
  const value = `${payloadB64}.${sig}`;
  const store = await cookies();
  store.set(COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: TTL_SECONDS,
  });
}

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  const idx = raw.indexOf('.');
  if (idx < 0) return null;
  const payloadB64 = raw.slice(0, idx);
  const sig = raw.slice(idx + 1);
  const expected = sign(payloadB64);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let payload: SessionPayload;
  try {
    payload = JSON.parse(b64urlDecode(payloadB64).toString('utf8')) as SessionPayload;
  } catch {
    return null;
  }
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  if (!payload.id || !payload.name || !payload.role) return null;

  // session cookie 14 天內不查 DB,role 直接簽在 payload 裡——這代表老闆停用
  // 某員工後,對方手上的舊 session 理論上還能繼續操作到 cookie 過期。這裡補一次
  // 輕量的 active 檢查,讓停用立即生效,不用等 14 天。查 users 表用 id(有索引),
  // 單筆查詢成本低,換來的是「停用」這個動作真的當下就生效。
  const sb = getSupabaseAdmin();
  const { data: user } = await sb.from('users').select('active').eq('id', payload.id).maybeSingle();
  if (!user || !user.active) return null;

  return { id: payload.id, name: payload.name, role: payload.role };
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
  });
}
