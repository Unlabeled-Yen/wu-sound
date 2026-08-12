import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { createDraftExpenseFromPhoto } from '@/lib/expense-capture';

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

  const bytes = new Uint8Array(await photo.arrayBuffer());
  const mediaType = photo.type || 'image/jpeg';

  try {
    const { id } = await createDraftExpenseFromPhoto(session.id, bytes, mediaType, 'app');
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '建立草稿失敗';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
