import { describe, expect, it } from 'vitest';
import { trimMessages, withSessionLock } from '@/lib/voice-agent-session';
import type { LlmMessage } from '@/lib/voice-agent-tools';

const userText = (text: string): LlmMessage => ({ role: 'user', content: [{ type: 'text', text }] });
const assistantCall = (id: string): LlmMessage => ({
  role: 'assistant',
  content: [{ type: 'tool_use', id, name: 'search_projects', input: {} }],
});
const toolResult = (id: string): LlmMessage => ({
  role: 'user',
  content: [{ type: 'tool_result', tool_use_id: id, content: '{}' }],
});

/** 一輪對話:使用者講一句 → 模型呼叫工具 → 工具結果 → 模型回覆 */
function oneTurn(n: number): LlmMessage[] {
  return [
    userText(`第 ${n} 句`),
    assistantCall(`t${n}`),
    toolResult(`t${n}`),
    { role: 'assistant', content: [{ type: 'text', text: `回覆 ${n}` }] },
  ];
}

describe('對話歷史修剪', () => {
  it('沒超過上限就原樣不動', () => {
    const msgs = [...oneTurn(1), ...oneTurn(2)];
    expect(trimMessages(msgs, 60)).toBe(msgs);
  });

  it('超過上限時從「使用者純文字」這種乾淨邊界切,不留下沒主人的 tool_result', () => {
    const msgs = Array.from({ length: 10 }, (_, i) => oneTurn(i + 1)).flat(); // 40 則
    const trimmed = trimMessages(msgs, 12);

    expect(trimmed.length).toBeLessThan(msgs.length);
    expect(trimmed[0]).toEqual(userText('第 8 句'));

    // 每個 tool_result 都要找得到前面對應的 tool_use,否則模型端會直接報錯
    const useIds = new Set<string>();
    for (const m of trimmed) {
      for (const b of m.content) {
        if (b.type === 'tool_use') useIds.add(b.id);
        if (b.type === 'tool_result') expect(useIds.has(b.tool_use_id)).toBe(true);
      }
    }
  });

  it('找不到乾淨切點就不切,寧可留長也不要切出壞掉的歷史', () => {
    const msgs = [assistantCall('a'), toolResult('a'), assistantCall('b'), toolResult('b')];
    expect(trimMessages(msgs, 2)).toBe(msgs);
  });
});

describe('同 session 排隊', () => {
  it('同一個 session 的兩個請求不會交錯執行', async () => {
    const order: string[] = [];
    const slow = async (tag: string, ms: number) => {
      order.push(`${tag}:start`);
      await new Promise((r) => setTimeout(r, ms));
      order.push(`${tag}:end`);
      return tag;
    };

    const a = withSessionLock('s1', () => slow('A', 30));
    const b = withSessionLock('s1', () => slow('B', 1));
    expect(await Promise.all([a, b])).toEqual(['A', 'B']);
    expect(order).toEqual(['A:start', 'A:end', 'B:start', 'B:end']);
  });

  it('前一輪炸掉不會把這個 session 卡死', async () => {
    const boom = withSessionLock('s2', async () => {
      throw new Error('炸了');
    });
    await expect(boom).rejects.toThrow('炸了');
    await expect(withSessionLock('s2', async () => 'ok')).resolves.toBe('ok');
  });

  it('不同 session 互不阻擋', async () => {
    const order: string[] = [];
    const a = withSessionLock('x', async () => {
      await new Promise((r) => setTimeout(r, 20));
      order.push('x');
    });
    const b = withSessionLock('y', async () => {
      order.push('y');
    });
    await Promise.all([a, b]);
    expect(order).toEqual(['y', 'x']);
  });
});
