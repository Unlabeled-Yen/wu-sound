import 'server-only';
import { AgentConfigError, type LlmClient, type LlmContentBlock } from '@/lib/voice-agent-tools';
import { toOpenAiMessages, toOpenAiTools } from '@/lib/voice-agent-kimi';

/**
 * OpenAI 的 LlmClient 實作,給 Lab 2 打字模式用(2026-08-15 加入)。
 *
 * 訊息/工具轉換直接重用 voice-agent-kimi.ts 的 toOpenAiMessages/toOpenAiTools——
 * Kimi 本來就是 OpenAI 相容介面,兩邊要轉的形狀一模一樣,沒有理由寫第二份會漂移的邏輯。
 * 這支檔案只負責「打去哪裡、帶哪把 key、回應怎麼解析」這些跟供應商綁定的部分。
 *
 * 為什麼要加這個選項:打字模式原本只有 Anthropic/Kimi 兩個選擇,Anthropic key
 * 一直是空的,所以一路在跑 Kimi——這幾天記錄的「已經幫你記了」措辭違規、
 * 簡體字、聽不懂上下文,大部分是 Kimi 指令遵從率偏低(實測約七八成)的老問題。
 * gpt-4o 是 Yen 的 project 白名單裡本來就有的模型,不用多辦一把 key。
 */

const DEFAULT_BASE = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o';
const MAX_TOKENS = 1024;

interface OpenAiToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export function createOpenAiLlm(): LlmClient {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new AgentConfigError('voice agent 尚未設定(缺 OPENAI_API_KEY)');
  const base = (process.env.VOICE_AGENT_OPENAI_BASE_URL ?? DEFAULT_BASE).replace(/\/+$/, '');
  const model = process.env.VOICE_AGENT_OPENAI_MODEL ?? DEFAULT_MODEL;

  return {
    async createMessage(req) {
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          max_tokens: MAX_TOKENS,
          messages: toOpenAiMessages(req.system, req.messages),
          ...(req.tools
            ? {
                tools: toOpenAiTools(req.tools),
                tool_choice: req.toolChoice === 'any' ? 'required' : 'auto',
              }
            : {}),
        }),
      });

      if (!res.ok) {
        // 模型端錯誤要 loud 拋出去,不要吞成「AI 剛好沒話說」
        const body = await res.text().catch(() => '');
        throw new Error(`OpenAI 呼叫失敗 (${res.status}): ${body.slice(0, 300)}`);
      }

      const data = (await res.json()) as {
        choices?: { message?: { content?: string | null; tool_calls?: OpenAiToolCall[] } }[];
      };
      const msg = data.choices?.[0]?.message;
      if (!msg) throw new Error('OpenAI 回傳沒有 choices[0].message');

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
          throw new Error(`OpenAI 的工具參數不是合法 JSON:${call.function.name} → ${call.function.arguments}`);
        }
        content.push({ type: 'tool_use', id: call.id, name: call.function.name, input });
      }
      return { content };
    },
  };
}
