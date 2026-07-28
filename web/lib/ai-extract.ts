import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import type { ExpenseAiDraft, ExpenseCategory } from './types';

const ANTHROPIC_PRIMARY = 'claude-sonnet-4-5';
const ANTHROPIC_FALLBACK = 'claude-sonnet-5';
const KIMI_DEFAULT_MODEL = 'moonshot-v1-8k-vision-preview';
const KIMI_DEFAULT_BASE = 'https://api.moonshot.ai/v1';

const PROMPT = `你是收據辨識助手,任務是從照片中盡量抓出消費資訊。這張照片可能是正式發票、收銀機小票,也可能是手寫的、非正式格式的單據或代墊憑證(例如隨手寫的紙條、便條紙、廠商手寫單)——不要因為格式不標準就直接放棄辨識。

請依序思考再回傳 JSON:
1. 先逐字辨認圖片上所有看得到的文字、數字、日期,包括手寫字跡,盡量辨認,不要因字跡潦草就跳過。
2. 從辨認結果找出金額(可能只是單獨寫的數字,沒有 $ 或「元」字)、日期(格式可能是斜線、點、中文年月日,或只寫幾月幾號)、消費項目、可能的分類。
3. 只有在真的完全看不出任何數字/文字(例如整張模糊、反光到看不到內容)時,才把該欄位填 null——單純格式不標準或字跡潦草但仍可辨認,都要盡力填出來,不能用「不像正式發票」當理由放棄。
4. 金額絕對不能用猜的方式編造一個看起來合理的數字——你填的必須是圖片上真實存在、你有辨認到的文字/數字。
5. 特別注意:手寫金額裡連續的零(例如 0000)最容易數錯位數,尤其字跡潦草時容易被看成花體底線或連筆而漏算、多算。看到連續零時,請一個一個仔細數清楚實際數量,再決定金額大小(例如是 3,000 還是 30,000 這種差一位數的情況要特別小心),不要憑印象隨意判斷。

只回傳以下 JSON 結構,不要 markdown code block、不要任何說明文字:
{
  "raw_text": "把你在圖片上辨認到的所有文字/數字逐字列出,盡量完整,包括手寫字",
  "spent_on": "YYYY-MM-DD 或 null",
  "amount_twd": 整數 (新台幣元) 或 null,
  "category": "fuel" | "parking" | "materials" | "other" | null,
  "item_text": "簡短品項描述 或 null",
  "confidence": "high" | "low"
}
分類規則:fuel = 加油/中油/台亞/山隆; parking = 停車費/過路費; materials = 材料/零件/五金; 其他歸 other。
日期抓消費日期(不是列印/掃描時間),真的沒有才填 null。`;

function safeParse(text: string): ExpenseAiDraft {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try {
    const obj = JSON.parse(trimmed) as Record<string, unknown>;
    const cat = obj.category;
    const validCat: ExpenseCategory | undefined =
      cat === 'fuel' || cat === 'parking' || cat === 'materials' || cat === 'other' ? cat : undefined;
    const conf = obj.confidence === 'high' ? 'high' : 'low';
    const amt = typeof obj.amount_twd === 'number' && Number.isFinite(obj.amount_twd)
      ? Math.round(obj.amount_twd)
      : undefined;
    const spent = typeof obj.spent_on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(obj.spent_on)
      ? obj.spent_on
      : undefined;
    const item = typeof obj.item_text === 'string' && obj.item_text.trim() ? obj.item_text.trim() : undefined;
    const rawText = typeof obj.raw_text === 'string' && obj.raw_text.trim() ? obj.raw_text.trim().slice(0, 500) : undefined;
    return {
      spent_on: spent,
      amount_twd: amt,
      category: validCat,
      item_text: item,
      confidence: conf,
      raw: rawText,
    };
  } catch {
    return { confidence: 'low', raw: text.slice(0, 500) };
  }
}

function normalizeMediaType(mediaType: string): string {
  return mediaType === 'image/jpeg' || mediaType === 'image/png' || mediaType === 'image/gif' || mediaType === 'image/webp'
    ? mediaType
    : 'image/jpeg';
}

async function extractViaAnthropic(b64: string, mediaType: string): Promise<ExpenseAiDraft> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  async function callModel(model: string): Promise<string> {
    const resp = await client.messages.create({
      model,
      max_tokens: 768,
      temperature: 0.1,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType as 'image/jpeg', data: b64 } },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    });
    const first = resp.content.find((c) => c.type === 'text');
    return first && first.type === 'text' ? first.text : '';
  }
  let text: string;
  try {
    text = await callModel(ANTHROPIC_PRIMARY);
  } catch {
    text = await callModel(ANTHROPIC_FALLBACK);
  }
  if (!text) return { confidence: 'low', raw: 'AI 無輸出' };
  return safeParse(text);
}

async function extractViaKimi(b64: string, mediaType: string): Promise<ExpenseAiDraft> {
  const baseURL = (process.env.KIMI_BASE_URL ?? KIMI_DEFAULT_BASE).replace(/\/$/, '');
  const model = process.env.AI_VISION_MODEL ?? KIMI_DEFAULT_MODEL;
  const resp = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.KIMI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 768,
      temperature: 0.1,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${mediaType};base64,${b64}` } },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    return { confidence: 'low', raw: `Kimi 呼叫失敗 (${resp.status}): ${body.slice(0, 300)}` };
  }
  const data = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content ?? '';
  if (!text) return { confidence: 'low', raw: 'AI 無輸出' };
  return safeParse(text);
}

export async function extractReceipt(
  imageBytes: Uint8Array,
  mediaType: string,
): Promise<ExpenseAiDraft> {
  const b64 = Buffer.from(imageBytes).toString('base64');
  const type = normalizeMediaType(mediaType);
  try {
    if (process.env.ANTHROPIC_API_KEY) {
      return await extractViaAnthropic(b64, type);
    }
    if (process.env.KIMI_API_KEY) {
      return await extractViaKimi(b64, type);
    }
    return { confidence: 'low', raw: '未設定任何 AI 金鑰 (ANTHROPIC_API_KEY 或 KIMI_API_KEY)' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { confidence: 'low', raw: `AI 呼叫失敗: ${msg}` };
  }
}
