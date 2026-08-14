import 'server-only';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * LINE Messaging API 整合。
 * 憲章:缺設定要 loud(拋錯,不靜默跳過),簽章一定要驗,絕不信任未驗證的 webhook。
 */

const PUSH_URL = 'https://api.line.me/v2/bot/message/push';
const REPLY_URL = 'https://api.line.me/v2/bot/message/reply';
const CONTENT_URL = (messageId: string) => `https://api-data.line.me/v2/bot/message/${messageId}/content`;

export function requireLineConfig(): { channelSecret: string; accessToken: string } {
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!channelSecret || !accessToken) {
    throw new Error('LINE 服務尚未設定(缺 LINE_CHANNEL_SECRET 或 LINE_CHANNEL_ACCESS_TOKEN)');
  }
  return { channelSecret, accessToken };
}

/** 驗 X-Line-Signature:HMAC-SHA256(channel secret, raw body) base64,常數時間比對 */
export function verifyLineSignature(rawBody: string, signatureHeader: string | null, channelSecret: string): boolean {
  if (!signatureHeader) return false;
  const expected = createHmac('sha256', channelSecret).update(rawBody).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export type LineMessage = { type: 'text'; text: string; quickReply?: unknown };

export function textMessage(text: string): LineMessage {
  return { type: 'text', text };
}

async function callLineApi(url: string, accessToken: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`LINE API 呼叫失敗 (${res.status}): ${text.slice(0, 300)}`);
  }
}

/** 回覆(免費,replyToken 一次性、有效期短),優先用這個 */
export async function replyMessage(replyToken: string, messages: LineMessage[]): Promise<void> {
  const { accessToken } = requireLineConfig();
  await callLineApi(REPLY_URL, accessToken, { replyToken, messages });
}

/** 主動推播(計入每月配額),用於通知(零用金送出/審核結果等) */
export async function pushMessage(lineUserId: string, messages: LineMessage[]): Promise<void> {
  const { accessToken } = requireLineConfig();
  await callLineApi(PUSH_URL, accessToken, { to: lineUserId, messages });
}

/** 下載使用者傳的圖片(收據照片) */
export async function fetchLineImageContent(messageId: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  const { accessToken } = requireLineConfig();
  const res = await fetch(CONTENT_URL(messageId), {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`下載 LINE 圖片失敗 (${res.status})`);
  }
  const contentType = res.headers.get('content-type') || 'image/jpeg';
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { bytes, contentType };
}

/**
 * 推播失敗不拋出、只記 log——通知是錦上添花,不能因為 LINE 掛掉就讓主要業務動作(送出零用金
 * 等)一起失敗。呼叫端仍應在 catch 裡記錄,不能完全吞掉不留痕跡。
 */
export async function pushMessageBestEffort(lineUserId: string | null, messages: LineMessage[]): Promise<{ ok: boolean; error?: string }> {
  if (!lineUserId) return { ok: false, error: '使用者尚未綁定 LINE' };
  try {
    await pushMessage(lineUserId, messages);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[line.pushMessageBestEffort]', msg);
    return { ok: false, error: msg };
  }
}
