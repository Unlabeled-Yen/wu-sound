import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import type { ExpenseAiDraft, ExpenseCategory } from './types';

const MODEL_PRIMARY = 'claude-sonnet-4-5';
const MODEL_FALLBACK = 'claude-sonnet-5';

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

export async function extractReceipt(
  imageBytes: Uint8Array,
  mediaType: string,
): Promise<ExpenseAiDraft> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { confidence: 'low', raw: 'ANTHROPIC_API_KEY 未設定' };
  }
  const client = new Anthropic({ apiKey });
  const b64 = Buffer.from(imageBytes).toString('base64');
  const supportedType =
    mediaType === 'image/jpeg' || mediaType === 'image/png' || mediaType === 'image/gif' || mediaType === 'image/webp'
      ? mediaType
      : 'image/jpeg';

  async function callModel(model: string): Promise<string> {
    const resp = await client.messages.create({
      model,
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: supportedType, data: b64 },
            },
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
    text = await callModel(MODEL_PRIMARY);
  } catch (e1) {
    try {
      text = await callModel(MODEL_FALLBACK);
    } catch (e2) {
      const msg = e2 instanceof Error ? e2.message : String(e2);
      return { confidence: 'low', raw: `AI 呼叫失敗: ${msg}` };
    }
  }

  if (!text) return { confidence: 'low', raw: 'AI 無輸出' };
  return safeParse(text);
}
