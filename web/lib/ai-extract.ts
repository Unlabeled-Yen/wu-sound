import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import type { ExpenseAiDraft, ExpenseCategory } from './types';

const ANTHROPIC_PRIMARY = 'claude-sonnet-4-5';
const ANTHROPIC_FALLBACK = 'claude-sonnet-5';
const KIMI_DEFAULT_MODEL = 'moonshot-v1-8k-vision-preview';
const KIMI_DEFAULT_BASE = 'https://api.moonshot.ai/v1';

const PROMPT = `你是收據辨識助手,任務是從照片中盡量抓出消費資訊。這張照片可能是正式發票、收銀機小票,也可能是手寫的、非正式格式的單據或代墊憑證(例如隨手寫的紙條、便條紙、廠商手寫單)——不要因為格式不標準就直接放棄辨識。

這個任務最容易出錯的地方是金額的位數(尤其連續的手寫零)。請嚴格按照以下順序處理,不要跳步驟:

第一步(只專心做這件事,先不要管其他欄位):找到收據上代表「總金額/總價」的手寫或印刷數字。把這個數字從左到右一個字一個字讀出來並數清楚,尤其連續的零要逐一計數(例如看到像圈圈連在一起的筆畫,要數清楚是幾個零),不要被花體筆畫、底線、連筆誤導而多算或少算。把你逐字讀取與數零的過程寫進 "amount_digit_reasoning" 欄位。

第二步:根據第一步數出來的結果填入 amount_twd(整數),必須跟第一步的推理過程一致,不能兜不起來,也不能用猜的方式編造一個看起來合理的數字。

第三步:再處理其他欄位——消費日期(如果是民國年,例如「114年」,要換算成西元年份:民國年+1911=西元年,例如 114 年 = 2025 年;抓消費日期不是列印/掃描時間)、分類、品項、原始轉錄文字。

只有在真的完全看不出任何數字/文字(例如整張模糊、反光到看不到內容)時,才把該欄位填 null——單純格式不標準或字跡潦草但仍可辨認,都要盡力填出來,不能用「不像正式發票」當理由放棄。

只回傳以下 JSON 結構,不要 markdown code block、不要任何說明文字:
{
  "amount_digit_reasoning": "第一步的逐字數零過程描述",
  "amount_twd": 整數 (新台幣元) 或 null,
  "raw_text": "把你在圖片上辨認到的所有文字/數字逐字列出,盡量完整,包括手寫字",
  "spent_on": "YYYY-MM-DD 或 null",
  "category": "fuel" | "parking" | "materials" | "other" | null,
  "item_text": "簡短品項描述 或 null",
  "confidence": "high" | "low"
}
分類規則:fuel = 加油/中油/台亞/山隆; parking = 停車費/過路費; materials = 材料/零件/五金; 其他歸 other。`;

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
    const rawText = typeof obj.raw_text === 'string' && obj.raw_text.trim() ? obj.raw_text.trim() : undefined;
    const digitReasoning = typeof obj.amount_digit_reasoning === 'string' && obj.amount_digit_reasoning.trim()
      ? obj.amount_digit_reasoning.trim()
      : undefined;
    const rawCombined = [digitReasoning, rawText].filter(Boolean).join(' | ').slice(0, 500) || undefined;
    return {
      spent_on: spent,
      amount_twd: amt,
      category: validCat,
      item_text: item,
      confidence: conf,
      raw: rawCombined,
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
