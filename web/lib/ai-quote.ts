import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

const ANTHROPIC_MODEL = 'claude-sonnet-4-5';
const KIMI_DEFAULT_MODEL = 'moonshot-v1-32k';
const KIMI_DEFAULT_BASE = 'https://api.moonshot.ai/v1';

export interface CatalogHint {
  name: string;
  brand: string | null;
  item_type: string | null;
  category: string | null;
}

export interface SuggestedLine {
  catalog_name: string;
  qty: number;
  spec?: string;
  reason?: string;
}

export type SuggestResult =
  | { lines: SuggestedLine[]; rationale: string }
  | { error: string };

function buildPrompt(needText: string, catalog: CatalogHint[]): string {
  const list = catalog
    .map((c) => {
      const parts = [c.brand, c.name].filter(Boolean).join(' ');
      const tail = [c.item_type, c.category].filter(Boolean).join(' / ');
      return tail ? `- ${parts}(${tail})` : `- ${parts}`;
    })
    .join('\n');
  return `你是專業音響工程的配置助手。老闆會給你一個案子的需求,你要從「品項清單」中挑出要用的設備與數量。

嚴格規則:
- 只從下面的品項清單挑選,catalog_name 必須是清單中出現的品名。
- 你絕對不決定價格,也不需要提到任何金額;價格由系統另外處理。
- 不確定數量就填 1。
- 不要發明清單以外的品項。若真的需要清單沒有的東西,catalog_name 用一句描述文字(系統會建成自由行讓老闆手動補)。
- 只回傳一個 JSON 物件,不要 markdown code block、不要任何說明文字。

JSON 結構:
{
  "lines": [
    { "catalog_name": "<必須是清單中的品名>", "qty": <整數>, "spec": "<選填規格>", "reason": "<為何選這項>" }
  ],
  "rationale": "<整體配置的說明,給老闆參考>"
}

案子需求:
${needText}

品項清單:
${list}`;
}

function safeParse(text: string): SuggestResult {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return { error: 'AI 回傳格式無法解析,請再試一次或改寫需求描述' };
  }
  const rawLines = Array.isArray(obj.lines) ? obj.lines : [];
  const lines: SuggestedLine[] = [];
  for (const raw of rawLines) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const name = typeof r.catalog_name === 'string' ? r.catalog_name.trim() : '';
    if (!name) continue;
    const qtyNum = typeof r.qty === 'number' && Number.isFinite(r.qty) ? Math.round(r.qty) : 1;
    const qty = qtyNum > 0 ? qtyNum : 1;
    const spec = typeof r.spec === 'string' && r.spec.trim() ? r.spec.trim() : undefined;
    const reason = typeof r.reason === 'string' && r.reason.trim() ? r.reason.trim() : undefined;
    lines.push({ catalog_name: name, qty, spec, reason });
  }
  if (lines.length === 0) {
    return { error: 'AI 沒有建議任何品項,請把需求描述得更具體一點' };
  }
  const rationale = typeof obj.rationale === 'string' ? obj.rationale.trim() : '';
  return { lines, rationale };
}

async function viaAnthropic(prompt: string): Promise<SuggestResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const resp = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 2048,
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
  });
  const first = resp.content.find((c) => c.type === 'text');
  const text = first && first.type === 'text' ? first.text : '';
  if (!text) return { error: 'AI 無輸出,請再試一次' };
  return safeParse(text);
}

async function viaKimi(prompt: string): Promise<SuggestResult> {
  const baseURL = (process.env.KIMI_BASE_URL ?? KIMI_DEFAULT_BASE).replace(/\/$/, '');
  const model = process.env.AI_QUOTE_MODEL ?? KIMI_DEFAULT_MODEL;
  const resp = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.KIMI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    return { error: `AI 呼叫失敗 (${resp.status}): ${body.slice(0, 200)}` };
  }
  const data = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content ?? '';
  if (!text) return { error: 'AI 無輸出,請再試一次' };
  return safeParse(text);
}

export async function suggestQuoteLines(
  needText: string,
  catalog: CatalogHint[],
): Promise<SuggestResult> {
  if (!needText.trim()) return { error: '請先輸入需求描述' };
  if (catalog.length === 0) return { error: '品項庫是空的,無法建議;請先建立品項' };
  const prompt = buildPrompt(needText.trim(), catalog);
  try {
    if (process.env.ANTHROPIC_API_KEY) return await viaAnthropic(prompt);
    if (process.env.KIMI_API_KEY) return await viaKimi(prompt);
    return { error: '未設定任何 AI 金鑰 (ANTHROPIC_API_KEY 或 KIMI_API_KEY)' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: `AI 呼叫失敗: ${msg}` };
  }
}
