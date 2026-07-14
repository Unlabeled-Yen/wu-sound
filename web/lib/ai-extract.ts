import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import type { ExpenseAiDraft, ExpenseCategory } from './types';

const ANTHROPIC_PRIMARY = 'claude-sonnet-4-5';
const ANTHROPIC_FALLBACK = 'claude-sonnet-5';
const KIMI_DEFAULT_MODEL = 'moonshot-v1-8k-vision-preview';
const KIMI_DEFAULT_BASE = 'https://api.moonshot.ai/v1';

const PROMPT = `你是收據辨識助手。只回傳 JSON,不要任何說明文字。JSON 結構:
{
  "spent_on": "YYYY-MM-DD 或 null",
  "amount_twd": 整數 (新台幣元) 或 null,
  "category": "fuel" | "parking" | "materials" | "other" | null,
  "item_text": "簡短品項描述 或 null",
  "confidence": "high" | "low"
}
規則:
- 金額無法確定時填 null,絕不猜。
- fuel = 加油/中油/台亞/山隆; parking = 停車費/過路費; materials = 材料/零件/五金; 其他歸 other。
- 日期抓收據上的消費日期(不是列印時間),沒有就 null。
- 只回傳 JSON 物件,不要 markdown code block。`;

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
    return {
      spent_on: spent,
      amount_twd: amt,
      category: validCat,
      item_text: item,
      confidence: conf,
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
      max_tokens: 512,
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
      max_tokens: 512,
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
