import 'server-only';
import {
  AgentConfigError,
  type LlmClient,
  type LlmContentBlock,
  type LlmMessage,
  type ToolSchema,
} from '@/lib/voice-agent-tools';

/**
 * Kimi(Moonshot)的 LlmClient 實作。
 *
 * 為什麼需要這一層:Kimi 走 OpenAI 相容介面,工具呼叫的訊息結構跟 Anthropic 不一樣——
 * Anthropic 是「assistant 訊息裡放 tool_use 區塊、user 訊息裡放 tool_result 區塊」,
 * OpenAI 是「assistant.tool_calls[] + 每個呼叫一則 role:'tool' 訊息」。
 * runtime 內部只認 Anthropic 那套結構(spec §2.1 選的原生 tool_use),
 * 所以這裡把兩邊互轉,runtime 一行都不用改。
 *
 * 注意這不等於「Kimi 跟 Claude 的 tool-calling 品質一樣」。契約層的防線
 * (id 不可捏造、兩階段 token、確認只認按鈕)不管換哪家模型都在,
 * 但「該不該追問、有沒有亂挑專案」這種判斷力是模型能力,要靠對話案例實測。
 */

const DEFAULT_BASE = 'https://api.moonshot.ai/v1';
const DEFAULT_MODEL = 'moonshot-v1-32k';
const MAX_TOKENS = 1024;

interface OpenAiToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

type OpenAiMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: OpenAiToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

function textOf(blocks: LlmContentBlock[]): string {
  return blocks
    .filter((b): b is Extract<LlmContentBlock, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

/** runtime 的訊息結構 → OpenAI 相容結構 */
export function toOpenAiMessages(system: string, messages: LlmMessage[]): OpenAiMessage[] {
  const out: OpenAiMessage[] = [{ role: 'system', content: system }];

  for (const m of messages) {
    const toolResults = m.content.filter(
      (b): b is Extract<LlmContentBlock, { type: 'tool_result' }> => b.type === 'tool_result',
    );
    // tool_result 一定要獨立成 role:'tool' 訊息,而且要緊接在發出呼叫的那則 assistant 之後
    if (toolResults.length > 0) {
      for (const r of toolResults) {
        out.push({ role: 'tool', tool_call_id: r.tool_use_id, content: r.content });
      }
      const leftover = textOf(m.content.filter((b) => b.type !== 'tool_result'));
      if (leftover) out.push({ role: 'user', content: leftover });
      continue;
    }

    if (m.role === 'assistant') {
      const calls = m.content
        .filter((b): b is Extract<LlmContentBlock, { type: 'tool_use' }> => b.type === 'tool_use')
        .map((b) => ({
          id: b.id,
          type: 'function' as const,
          function: { name: b.name, arguments: JSON.stringify(b.input) },
        }));
      const text = textOf(m.content);
      out.push({
        role: 'assistant',
        content: text || null,
        ...(calls.length > 0 ? { tool_calls: calls } : {}),
      });
      continue;
    }

    out.push({ role: 'user', content: textOf(m.content) });
  }

  return out;
}

export function toOpenAiTools(tools: ToolSchema[]) {
  return tools.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));
}

export function createKimiLlm(): LlmClient {
  const apiKey = process.env.KIMI_API_KEY;
  if (!apiKey) throw new AgentConfigError('voice agent 尚未設定(缺 KIMI_API_KEY)');
  const base = (process.env.KIMI_BASE_URL ?? DEFAULT_BASE).replace(/\/+$/, '');
  const model = process.env.VOICE_AGENT_KIMI_MODEL ?? DEFAULT_MODEL;

  return {
    async createMessage(req) {
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          max_tokens: MAX_TOKENS,
          messages: toOpenAiMessages(req.system, req.messages),
          ...(req.tools ? { tools: toOpenAiTools(req.tools), tool_choice: 'auto' } : {}),
        }),
      });

      if (!res.ok) {
        // 模型端錯誤要 loud 拋出去,不要吞成「AI 剛好沒話說」
        const body = await res.text().catch(() => '');
        throw new Error(`Kimi 呼叫失敗 (${res.status}): ${body.slice(0, 300)}`);
      }

      const data = (await res.json()) as {
        choices?: { message?: { content?: string | null; tool_calls?: OpenAiToolCall[] } }[];
      };
      const msg = data.choices?.[0]?.message;
      if (!msg) throw new Error('Kimi 回傳沒有 choices[0].message');

      const content: LlmContentBlock[] = [];
      if (typeof msg.content === 'string' && msg.content.trim()) {
        content.push({ type: 'text', text: msg.content });
      }
      for (const call of msg.tool_calls ?? []) {
        let input: Record<string, unknown>;
        try {
          input = call.function.arguments ? (JSON.parse(call.function.arguments) as Record<string, unknown>) : {};
        } catch {
          // 參數不是合法 JSON 就是模型出包。不能猜一個空物件送進工具——
          // 那會變成「用預設值寫了一筆誰也沒要求的東西」,寧可整輪失敗
          throw new Error(`Kimi 的工具參數不是合法 JSON:${call.function.name} → ${call.function.arguments}`);
        }
        content.push({ type: 'tool_use', id: call.id, name: call.function.name, input });
      }
      return { content };
    },
  };
}
