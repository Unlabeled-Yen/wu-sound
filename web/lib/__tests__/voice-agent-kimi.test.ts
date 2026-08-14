import { describe, expect, it } from 'vitest';
import { toOpenAiMessages, toOpenAiTools } from '@/lib/voice-agent-kimi';
import { AGENT_TOOLS, type LlmMessage } from '@/lib/voice-agent-tools';

/**
 * 驗 Anthropic 結構 ↔ OpenAI 相容結構的互轉。
 * 這一層轉錯的典型後果是「工具結果對不到呼叫」→ 模型開始亂編,
 * 所以 tool_call_id 的對齊是重點。
 */

describe('訊息結構轉換', () => {
  it('assistant 的 tool_use → tool_calls,對應的 tool_result → 獨立的 role:tool 訊息', () => {
    const messages: LlmMessage[] = [
      { role: 'user', content: [{ type: 'text', text: '幫我記一筆' }] },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: '我查一下' },
          { type: 'tool_use', id: 'call_1', name: 'search_projects', input: { query: '磐頂' } },
        ],
      },
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'call_1', content: '{"candidates":[]}' }],
      },
    ];

    expect(toOpenAiMessages('系統規則', messages)).toEqual([
      { role: 'system', content: '系統規則' },
      { role: 'user', content: '幫我記一筆' },
      {
        role: 'assistant',
        content: '我查一下',
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'search_projects', arguments: '{"query":"磐頂"}' } },
        ],
      },
      { role: 'tool', tool_call_id: 'call_1', content: '{"candidates":[]}' },
    ]);
  });

  it('同一輪多個工具呼叫 → 每個呼叫各自一則 tool 訊息,id 一一對上', () => {
    const messages: LlmMessage[] = [
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'a', name: 'list_tasks', input: {} },
          { type: 'tool_use', id: 'b', name: 'get_project_summary', input: {} },
        ],
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'a', content: 'A' },
          { type: 'tool_result', tool_use_id: 'b', content: 'B' },
        ],
      },
    ];
    const out = toOpenAiMessages('s', messages);
    expect(out.slice(2)).toEqual([
      { role: 'tool', tool_call_id: 'a', content: 'A' },
      { role: 'tool', tool_call_id: 'b', content: 'B' },
    ]);
  });

  it('確認/取消那種 [系統] 註記(跟 tool_result 混在同一則)不會被吃掉', () => {
    const messages: LlmMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'a', content: 'A' },
          { type: 'text', text: '[系統] 使用者按下確認,已寫入' },
        ],
      },
    ];
    const out = toOpenAiMessages('s', messages);
    expect(out[1]).toEqual({ role: 'tool', tool_call_id: 'a', content: 'A' });
    expect(out[2]).toEqual({ role: 'user', content: '[系統] 使用者按下確認,已寫入' });
  });

  it('純文字的 assistant 訊息不帶 tool_calls 欄位', () => {
    const out = toOpenAiMessages('s', [{ role: 'assistant', content: [{ type: 'text', text: '好的' }] }]);
    expect(out[1]).toEqual({ role: 'assistant', content: '好的' });
  });
});

describe('工具定義轉換', () => {
  it('8 個工具都轉成 function 格式,input_schema 原樣當 parameters', () => {
    // 2026-08-14 回退:民生救難三個工具(get_now/get_weather/emergency_info)
    // 移除後準確度回到 Yen 親自肯定過的水準,見 voice-agent-tools.ts 的 READ_TOOLS 註解
    const tools = toOpenAiTools(AGENT_TOOLS);
    expect(tools).toHaveLength(8);
    expect(tools.map((t) => t.function.name)).toEqual([
      'search_projects',
      'get_project_summary',
      'list_tasks',
      'ask_clarification',
      'respond',
      'decline',
      'propose_create_task',
      'propose_log_note',
    ]);
    expect(tools[0].function.parameters).toBe(AGENT_TOOLS[0].input_schema);
    // 換供應商不會讓寫入工具偷偷跑出來
    expect(tools.map((t) => t.function.name)).not.toContain('log_note');
  });
});
