import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin, RECEIPTS_BUCKET } from '@/lib/supabase';

export const runtime = 'nodejs';

const VALID_REASONS = new Set(['delivery', 'maintenance', 'interview', 'other']);

async function uploadPhoto(file: File, userId: string): Promise<string> {
  if (!file || typeof file === 'string') throw new Error('照片檔案無效');
  if (file.size === 0) throw new Error('照片檔案為空');
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `worklogs/${userId}/${randomUUID()}.${ext}`;
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.storage.from(RECEIPTS_BUCKET).upload(path, buf, {
    contentType: file.type || 'image/jpeg',
    upsert: false,
  });
  if (error) throw new Error(`照片上傳失敗: ${error.message}`);
  return path;
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: '無效的表單' }, { status: 400 });
  }

  const siteId = String(form.get('site_id') || '').trim();
  const note = String(form.get('note') || '').trim();
  const noPhotoReason = String(form.get('no_photo_reason') || '').trim();
  const beforeFile = form.get('before_photo');
  const afterFile = form.get('after_photo');

  if (!siteId) return NextResponse.json({ error: '請選擇專案' }, { status: 400 });
  if (!note) return NextResponse.json({ error: '請填寫一句話說明' }, { status: 400 });
  if (note.length > 200) return NextResponse.json({ error: '說明超過 200 字' }, { status: 400 });

  const hasBefore = beforeFile instanceof File && beforeFile.size > 0;
  const hasAfter = afterFile instanceof File && afterFile.size > 0;
  const beforeProvided = beforeFile instanceof File && beforeFile.name;
  const afterProvided = afterFile instanceof File && afterFile.name;

  // Empty file uploaded → 400
  if (beforeProvided && beforeFile instanceof File && beforeFile.size === 0) {
    return NextResponse.json({ error: '施工前照片檔案為空' }, { status: 400 });
  }
  if (afterProvided && afterFile instanceof File && afterFile.size === 0) {
    return NextResponse.json({ error: '施工後照片檔案為空' }, { status: 400 });
  }

  if (!hasBefore || !hasAfter) {
    if (!noPhotoReason) {
      return NextResponse.json({ error: '未附照片時,請選擇無照片原因' }, { status: 400 });
    }
    if (!VALID_REASONS.has(noPhotoReason)) {
      return NextResponse.json({ error: '無照片原因不正確' }, { status: 400 });
    }
  }

  const photos: { kind: 'before' | 'after'; path: string }[] = [];
  try {
    if (hasBefore) photos.push({ kind: 'before', path: await uploadPhoto(beforeFile as File, session.id) });
    if (hasAfter) photos.push({ kind: 'after', path: await uploadPhoto(afterFile as File, session.id) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '照片上傳失敗';
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('worklogs')
    .insert({
      user_id: session.id,
      site_id: siteId,
      note,
      photos,
      no_photo_reason: hasBefore && hasAfter ? null : noPhotoReason,
    })
    .select('id')
    .single();
  if (error) {
    return NextResponse.json({ error: `建立工作記錄失敗: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data.id });
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });

  const url = new URL(req.url);
  const dateParam = url.searchParams.get('date');
  const all = url.searchParams.get('all') === '1';

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('worklogs')
    .select('id, user_id, site_id, logged_on, note, photos, no_photo_reason, created_at, users(name), sites(name)')
    .order('created_at', { ascending: false });

  if (dateParam) {
    if (dateParam === 'today') {
      const today = new Date().toISOString().slice(0, 10);
      query = query.eq('logged_on', today);
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      query = query.eq('logged_on', dateParam);
    } else {
      return NextResponse.json({ error: '日期格式錯誤' }, { status: 400 });
    }
  }

  if (all) {
    if (session.role !== 'boss') {
      return NextResponse.json({ error: '無權限' }, { status: 403 });
    }
  } else {
    query = query.eq('user_id', session.id);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: `讀取工作記錄失敗: ${error.message}` }, { status: 500 });
  }

  // Add signed URLs for photos
  const withUrls = await Promise.all(
    (data || []).map(async (row) => {
      const photos = Array.isArray(row.photos) ? (row.photos as { kind: string; path: string }[]) : [];
      const signed = await Promise.all(
        photos.map(async (p) => {
          const { data: s } = await supabase.storage
            .from(RECEIPTS_BUCKET)
            .createSignedUrl(p.path, 60 * 60);
          return { kind: p.kind, url: s?.signedUrl || null };
        })
      );
      return { ...row, photo_urls: signed };
    })
  );

  return NextResponse.json({ ok: true, worklogs: withUrls });
}
