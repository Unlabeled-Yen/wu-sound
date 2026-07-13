import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin, RECEIPTS_BUCKET } from '@/lib/supabase';
import { extractReceipt } from '@/lib/ai-extract';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: '無效的請求' }, { status: 400 });
  }

  const photo = form.get('photo');
  if (!(photo instanceof Blob) || photo.size === 0) {
    return NextResponse.json({ error: '缺少照片' }, { status: 400 });
  }
  if (photo.size > 15 * 1024 * 1024) {
    return NextResponse.json({ error: '照片過大 (>15MB)' }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const bytes = new Uint8Array(await photo.arrayBuffer());
  const mediaType = photo.type || 'image/jpeg';
  const ext = mediaType === 'image/png' ? 'png' : mediaType === 'image/webp' ? 'webp' : 'jpg';
  const objectPath = `${session.id}/${crypto.randomUUID()}.${ext}`;

  const up = await sb.storage
    .from(RECEIPTS_BUCKET)
    .upload(objectPath, bytes, { contentType: mediaType, upsert: false });
  if (up.error) {
    return NextResponse.json({ error: `上傳失敗: ${up.error.message}` }, { status: 500 });
  }

  const ins = await sb
    .from('expenses')
    .insert({
      user_id: session.id,
      source: 'app',
      status: 'draft',
      receipt_url: objectPath,
      ai_draft: null,
    })
    .select('id')
    .single();
  if (ins.error || !ins.data) {
    await sb.storage.from(RECEIPTS_BUCKET).remove([objectPath]);
    return NextResponse.json(
      { error: `建立草稿失敗: ${ins.error?.message ?? 'unknown'}` },
      { status: 500 },
    );
  }
  const id = ins.data.id as string;

  // AI extraction — errors captured to ai_draft, never thrown to client
  let draft;
  try {
    draft = await extractReceipt(bytes, mediaType);
  } catch (e) {
    draft = { confidence: 'low' as const, raw: e instanceof Error ? e.message : String(e) };
  }
  await sb.from('expenses').update({ ai_draft: draft }).eq('id', id);

  return NextResponse.json({ ok: true, id });
}
