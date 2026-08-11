import 'server-only';
import { createHash } from 'crypto';
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * voice-lab Lab 1 轉接層共用工具。
 * 規格:voice-lab/lab1-wu-adapter-spec-v1.md
 * 契約:voice-lab/contract/tool-contract-v1.md
 */

export const CONTRACT_VERSION = '1.0';

export type VoiceErrorCode =
  | 'TOKEN_REQUIRED'
  | 'TOKEN_INVALID'
  | 'TOKEN_PAYLOAD_MISMATCH'
  | 'PROJECT_NOT_FOUND'
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'SERVICE_UNAVAILABLE';

export function voiceError(code: VoiceErrorCode, messageZh: string, status: number): NextResponse {
  return withVersion(NextResponse.json({ error_code: code, message_zh: messageZh }, { status }));
}

export function withVersion(res: NextResponse): NextResponse {
  res.headers.set('X-Contract-Version', CONTRACT_VERSION);
  return res;
}

/** canonical JSON:鍵排序、無空白,契約 §1.3 要求的 hash 基礎 */
export function canonicalJson(obj: Record<string, unknown>): string {
  const sortedKeys = Object.keys(obj).sort();
  const sorted: Record<string, unknown> = {};
  for (const k of sortedKeys) sorted[k] = obj[k];
  return JSON.stringify(sorted);
}

export function payloadHash(obj: Record<string, unknown>): string {
  return createHash('sha256').update(canonicalJson(obj)).digest('hex');
}

/**
 * 表不存在(migration 009 未套用)判斷。
 * 實測確認:PostgREST 對 schema cache 裡沒有的表回 PGRST205(不是原生 Postgres
 * undefined_table 42P01——42P01 是直連 psql 才會看到的代碼,PostgREST 自己包了一層)。
 * 兩種都收,避免哪天 PostgREST 版本行為改變又漏接。
 */
export function isUndefinedTableError(error: { code?: string } | null | undefined): boolean {
  return error?.code === 'PGRST205' || error?.code === '42P01';
}

interface VoiceAuthOk {
  ok: true;
  sb: SupabaseClient;
  actorId: string;
}
interface VoiceAuthFail {
  ok: false;
  response: NextResponse;
}

/**
 * 驗 Bearer VOICE_API_KEY + 解析 actor(VOICE_ACTOR_USER_ID,須為 active 使用者)。
 * 缺配置 loud 回 503,不靜默放行(voice-lab spec §8 風險條款)。
 */
export async function authenticateVoiceRequest(req: Request): Promise<VoiceAuthOk | VoiceAuthFail> {
  const expectedKey = process.env.VOICE_API_KEY;
  if (!expectedKey) {
    return { ok: false, response: voiceError('SERVICE_UNAVAILABLE', 'voice 服務尚未設定(缺 VOICE_API_KEY)', 503) };
  }
  const actorUserId = process.env.VOICE_ACTOR_USER_ID;
  if (!actorUserId) {
    return { ok: false, response: voiceError('SERVICE_UNAVAILABLE', 'voice 服務尚未設定(缺 VOICE_ACTOR_USER_ID)', 503) };
  }

  const authHeader = req.headers.get('authorization') ?? '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const providedKey = match?.[1];
  if (!providedKey || providedKey !== expectedKey) {
    return { ok: false, response: voiceError('UNAUTHORIZED', '未授權', 401) };
  }

  const sb = getSupabaseAdmin();
  const { data: actor, error } = await sb
    .from('users')
    .select('id, active')
    .eq('id', actorUserId)
    .maybeSingle();
  if (error) {
    return { ok: false, response: voiceError('SERVICE_UNAVAILABLE', `讀取 actor 失敗: ${error.message}`, 503) };
  }
  if (!actor || !actor.active) {
    return { ok: false, response: voiceError('SERVICE_UNAVAILABLE', 'voice 服務的 actor 使用者不存在或已停用', 503) };
  }

  return { ok: true, sb, actorId: actor.id as string };
}

/** 統一把「表不存在」轉成 loud 503,其餘 DB 錯誤轉成 500 */
export function dbErrorResponse(error: { code?: string; message: string }): NextResponse {
  if (isUndefinedTableError(error)) {
    return voiceError('SERVICE_UNAVAILABLE', 'voice 資料表尚未建立,請先套用 migration 009_voice_tasks_proposals.sql', 503);
  }
  return withVersion(NextResponse.json({ error_code: 'BAD_REQUEST', message_zh: `資料庫錯誤: ${error.message}` }, { status: 500 }));
}
