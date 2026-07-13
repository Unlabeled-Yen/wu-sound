import 'server-only';
import bcrypt from 'bcryptjs';
import { getSupabaseAdmin } from './supabase';
import type { SessionUser } from './types';

const BCRYPT_ROUNDS = 10;

export async function hashPin(pin: string): Promise<string> {
  if (!/^\d{4}$/.test(pin)) {
    throw new Error('PIN 必須為 4 位數字');
  }
  return bcrypt.hash(pin, BCRYPT_ROUNDS);
}

export async function verifyPin(name: string, pin: string): Promise<SessionUser | null> {
  if (!name || !/^\d{4}$/.test(pin)) return null;
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('users')
    .select('id, name, role, pin_hash, active')
    .eq('name', name)
    .eq('active', true)
    .maybeSingle();
  if (error) {
    throw new Error(`Supabase 查詢使用者失敗: ${error.message}`);
  }
  if (!data) return null;
  const ok = await bcrypt.compare(pin, data.pin_hash as string);
  if (!ok) return null;
  return { id: data.id as string, name: data.name as string, role: data.role as SessionUser['role'] };
}
