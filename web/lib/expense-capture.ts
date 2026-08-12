import 'server-only';
import { getSupabaseAdmin, RECEIPTS_BUCKET } from '@/lib/supabase';
import { extractReceipt } from '@/lib/ai-extract';

/**
 * 拍收據 → 建 draft expense 的共用邏輯。
 * 原本只有 /api/expenses/capture 一條路(手機 app 上傳),LINE webhook 收到照片
 * 訊息也要走同一條路——抽出來避免兩邊各寫一份、邏輯漂移。
 */
export async function createDraftExpenseFromPhoto(
  userId: string,
  bytes: Uint8Array,
  mediaType: string,
  source: 'app' | 'line' = 'app',
): Promise<{ id: string }> {
  const sb = getSupabaseAdmin();
  const ext = mediaType === 'image/png' ? 'png' : mediaType === 'image/webp' ? 'webp' : 'jpg';
  const objectPath = `${userId}/${crypto.randomUUID()}.${ext}`;

  const up = await sb.storage
    .from(RECEIPTS_BUCKET)
    .upload(objectPath, bytes, { contentType: mediaType, upsert: false });
  if (up.error) {
    throw new Error(`上傳失敗: ${up.error.message}`);
  }

  const ins = await sb
    .from('expenses')
    .insert({
      user_id: userId,
      source,
      status: 'draft',
      receipt_url: objectPath,
      ai_draft: null,
    })
    .select('id')
    .single();
  if (ins.error || !ins.data) {
    await sb.storage.from(RECEIPTS_BUCKET).remove([objectPath]);
    throw new Error(`建立草稿失敗: ${ins.error?.message ?? 'unknown'}`);
  }
  const id = ins.data.id as string;

  // AI extraction — errors captured to ai_draft, never thrown to caller
  let draft;
  try {
    draft = await extractReceipt(bytes, mediaType);
  } catch (e) {
    draft = { confidence: 'low' as const, raw: e instanceof Error ? e.message : String(e) };
  }
  await sb.from('expenses').update({ ai_draft: draft }).eq('id', id);

  return { id };
}
