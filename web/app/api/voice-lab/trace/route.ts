import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

/**
 * 語音助理的對話軌跡收集端點。
 *
 * 為什麼要這個:在這之前,判斷「AI 表現好不好」唯一的資料來源是使用者口頭
 * 回報單次體感,結果連續誤判過幾次——最嚴重的一次是「AI 說記好了但沒寫入」,
 * 只查了 tasks 表就判定成說謊,實際上是寫進 worklogs 的分類錯配,而那個誤判
 * 又導致確認機制被整個拆掉。有完整軌跡的話一眼就看得出來。
 *
 * 這是做錯誤分析(open coding → axial coding → 依頻率修)的前提,
 * 方法學見 hamel.dev/blog/posts/evals-faq。
 *
 * 設計上的兩個要求,都是為了「絕不影響通話本身」:
 * - 前端 fire-and-forget,不 await、失敗不擋通話(見 RealtimeVoiceClient 的 trace())
 * - 這裡也不做任何會拖慢的事,寫不進去就回 200 帶 stored:false,不讓前端重試
 *
 * 隱私:存的是真實對話文字(不存音檔)。只有老闆看得到(/boss/voice-traces),
 * 保留期 90 天,清理用 migration 025 裡的 prune_voice_traces()。
 */

type Kind = 'user_speech' | 'ai_speech' | 'tool_call' | 'error';
const KINDS = new Set<Kind>(['user_speech', 'ai_speech', 'tool_call', 'error']);

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: '請求格式不是有效的 JSON' }, { status: 400 });
  }

  const sessionId = typeof body.session_id === 'string' ? body.session_id : '';
  const seq = typeof body.seq === 'number' ? body.seq : NaN;
  const kind = body.kind as Kind;
  if (!sessionId || !Number.isFinite(seq) || !KINDS.has(kind)) {
    return NextResponse.json({ error: '缺少 session_id / seq / kind,或 kind 不在允許清單' }, { status: 400 });
  }

  const payload = body.payload && typeof body.payload === 'object' ? body.payload : {};

  const sb = getSupabaseAdmin();
  const { error } = await sb.from('voice_traces').insert({
    session_id: sessionId,
    // 一律用登入者的身分,不接受前端傳來的 user_id——不然任何人都能偽造別人的軌跡
    user_id: session.id,
    seq,
    kind,
    payload,
  });

  if (error) {
    // 診斷用的東西壞掉不能連累通話,但要在伺服器 log 看得見,不要靜默吞掉
    console.error('[voice-trace] 寫入失敗:', error.message);
    return NextResponse.json({ stored: false, reason: error.message });
  }
  return NextResponse.json({ stored: true });
}
