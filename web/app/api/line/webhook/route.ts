import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { createDraftExpenseFromPhoto } from '@/lib/expense-capture';
import {
  fetchLineImageContent,
  replyMessage,
  requireLineConfig,
  textMessage,
  verifyLineSignature,
} from '@/lib/line';

export const runtime = 'nodejs';

interface LineEvent {
  type: string;
  replyToken?: string;
  source?: { type: string; userId?: string };
  message?: { type: string; id: string; text?: string };
}

const BIND_RE = /綁定\s*(\d{6})/;

async function findUserByLineId(sb: ReturnType<typeof getSupabaseAdmin>, lineUserId: string) {
  const { data, error } = await sb
    .from('users')
    .select('id, name, role, active')
    .eq('line_user_id', lineUserId)
    .maybeSingle();
  if (error) throw new Error(`查詢使用者失敗: ${error.message}`);
  return data;
}

async function handleBind(
  sb: ReturnType<typeof getSupabaseAdmin>,
  lineUserId: string,
  code: string,
): Promise<string> {
  const { data: row, error } = await sb
    .from('line_bind_codes')
    .select('code, user_id, expires_at, used_at')
    .eq('code', code)
    .maybeSingle();
  if (error) return `綁定失敗:${error.message}`;
  if (!row) return '這組綁定碼不存在,請確認數字是否正確';
  if (row.used_at) return '這組綁定碼已經用過了,請重新產生一組';
  if (new Date(row.expires_at).getTime() < Date.now()) return '這組綁定碼已逾時,請重新產生一組';

  const { data: existingUser } = await sb
    .from('users')
    .select('id, name, line_user_id')
    .eq('id', row.user_id)
    .maybeSingle();
  if (!existingUser) return '找不到對應的使用者';
  if (existingUser.line_user_id) return '這個帳號已經綁定過 LINE 了';

  const { error: updErr } = await sb
    .from('users')
    .update({ line_user_id: lineUserId })
    .eq('id', row.user_id);
  if (updErr) return `綁定失敗:${updErr.message}`;

  await sb.from('line_bind_codes').update({ used_at: new Date().toISOString() }).eq('code', code);

  return `綁定成功!${existingUser.name},以後可以直接在這裡打卡、拍收據、記工作記錄。`;
}

async function handleClockin(
  sb: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  type: 'in' | 'out',
): Promise<string> {
  const { error } = await sb.from('clockins').insert({
    user_id: userId,
    ts: new Date().toISOString(),
    type,
    is_backfill: false,
  });
  if (error) return `打卡失敗:${error.message}`;
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return `${type === 'in' ? '上班' : '下班'}打卡成功,${hhmm}`;
}

async function handleImage(
  sb: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  messageId: string,
): Promise<string> {
  try {
    const { bytes, contentType } = await fetchLineImageContent(messageId);
    await createDraftExpenseFromPhoto(userId, bytes, contentType, 'line');
    return '收據已收到,存成草稿了。金額/分類請到 App「待送出」補完再送出。';
  } catch (e) {
    const msg = e instanceof Error ? e.message : '處理收據失敗';
    return `收據處理失敗:${msg},請改用手機 App 拍照試試`;
  }
}

const HELP_TEXT = [
  '可以打的指令:',
  '・上班 / 下班 → 打卡',
  '・傳照片 → 記一筆零用金草稿(收據)',
  '・綁定 123456 → 綁定帳號(先去 App 產生綁定碼)',
].join('\n');

async function handleEvent(sb: ReturnType<typeof getSupabaseAdmin>, event: LineEvent): Promise<void> {
  if (event.type !== 'message') return;
  const replyToken = event.replyToken;
  const lineUserId = event.source?.userId;
  if (!replyToken || !lineUserId || event.source?.type !== 'user') return;

  const message = event.message;
  if (!message) return;

  // 文字訊息:綁定指令不需要先綁定就能用
  if (message.type === 'text' && message.text) {
    const bindMatch = message.text.match(BIND_RE);
    if (bindMatch) {
      const reply = await handleBind(sb, lineUserId, bindMatch[1]);
      await replyMessage(replyToken, [textMessage(reply)]);
      return;
    }
  }

  const user = await findUserByLineId(sb, lineUserId);
  if (!user || !user.active) {
    await replyMessage(replyToken, [
      textMessage('這個 LINE 帳號還沒綁定,請先到 App 的設定頁產生綁定碼,再傳「綁定 123456」給我。'),
    ]);
    return;
  }

  if (message.type === 'text' && message.text) {
    const text = message.text.trim();
    if (text === '上班') {
      await replyMessage(replyToken, [textMessage(await handleClockin(sb, user.id, 'in'))]);
      return;
    }
    if (text === '下班') {
      await replyMessage(replyToken, [textMessage(await handleClockin(sb, user.id, 'out'))]);
      return;
    }
    await replyMessage(replyToken, [textMessage(HELP_TEXT)]);
    return;
  }

  if (message.type === 'image') {
    const reply = await handleImage(sb, user.id, message.id);
    await replyMessage(replyToken, [textMessage(reply)]);
    return;
  }

  await replyMessage(replyToken, [textMessage(HELP_TEXT)]);
}

export async function POST(req: Request) {
  let channelSecret: string;
  try {
    ({ channelSecret } = requireLineConfig());
  } catch (e) {
    // 缺設定要 loud,但 LINE 平台看到非 200 會重送——回 200 附錯誤說明,錯誤進 server log
    console.error('[line.webhook] config missing:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'LINE 服務尚未設定' }, { status: 200 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get('x-line-signature');
  if (!verifyLineSignature(rawBody, signature, channelSecret)) {
    return NextResponse.json({ error: '簽章驗證失敗' }, { status: 401 });
  }

  let payload: { events?: LineEvent[] };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: '無效的 JSON' }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const events = payload.events ?? [];

  // 逐一處理,單一事件失敗不影響其他事件;每個錯誤記 log 不吞掉
  for (const event of events) {
    try {
      await handleEvent(sb, event);
    } catch (e) {
      console.error('[line.webhook] event handling failed:', e instanceof Error ? e.message : e);
    }
  }

  return NextResponse.json({ ok: true });
}
