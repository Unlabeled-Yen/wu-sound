import { describe, expect, it, beforeEach } from 'vitest';
import {
  cancelPending,
  confirmPending,
  formatDueDate,
  handleVoiceCommand,
  matchVoiceCommand,
  resolveContext,
  toTraditional,
  runAgentTurn,
  todayInTaipei,
  type AgentDeps,
  type LlmContentBlock,
  type LlmRequest,
} from '@/lib/voice-agent';
import { getOrCreateSession, resetSessionsForTest } from '@/lib/voice-agent-session';
import type { ToolResult } from '@/lib/voice-agent-tools';

/**
 * Lab 2 agent runtime 單元測試。
 * LLM 與 Lab 1 端點都用假的:這裡驗的是「runtime 的鐵律有沒有寫死在程式結構裡」,
 * 對話品質本身另外用 lab2-conversation-cases.md 的腳本化案例人工跑(spec §7)。
 */

const SITE_ID = '11111111-1111-4111-8111-111111111111';
const TOKEN = '22222222-2222-4222-8222-222222222222';

function fakeLlm(turns: LlmContentBlock[][]) {
  const seen: LlmRequest[] = [];
  let i = 0;
  return {
    seen,
    client: {
      async createMessage(req: LlmRequest) {
        seen.push(req);
        const content = turns[i] ?? [{ type: 'text' as const, text: '(沒有更多假回應了)' }];
        i += 1;
        return { content };
      },
    },
  };
}

function fakeTools(handlers: Record<string, (body: Record<string, unknown>) => ToolResult>) {
  const calls: { tool: string; body: Record<string, unknown> }[] = [];
  return {
    calls,
    client: {
      async call(tool: string, body: Record<string, unknown>) {
        calls.push({ tool, body });
        const h = handlers[tool];
        if (!h) return { ok: false as const, status: 404, error_code: 'BAD_REQUEST', message_zh: `未知工具 ${tool}` };
        return h(body);
      },
    },
  };
}

const okSearch = (): ToolResult => ({
  ok: true,
  data: { candidates: [{ id: SITE_ID, name: '磐頂長老教會', status: 'active', client_name: null }] },
});

const okPropose = (body: Record<string, unknown>): ToolResult => ({
  ok: true,
  data: {
    confirmation_token: TOKEN,
    canonical_echo: body.payload as Record<string, unknown>,
    expires_in_seconds: 60,
  },
});

function session(id = 's1') {
  return getOrCreateSession(id).session;
}

function deps(llm: AgentDeps['llm'], tools: AgentDeps['tools']): AgentDeps {
  return { llm, tools, now: () => Date.parse('2026-08-14T02:00:00Z') };
}

beforeEach(() => resetSessionsForTest());

describe('system prompt', () => {
  it('注入台北時區的今天日期,不讓 LLM 自己猜相對日期', () => {
    // 2026-08-14 02:00 UTC = 台北 10:00 同日
    expect(todayInTaipei(Date.parse('2026-08-14T02:00:00Z'))).toBe('2026-08-14');
    // UTC 前一天晚上,台北已經是隔天
    expect(todayInTaipei(Date.parse('2026-08-14T17:00:00Z'))).toBe('2026-08-15');
  });
});

describe('期限欄位的星期幾', () => {
  it('由 runtime 自己算,模型算錯一天就會在卡片上現形', () => {
    // 實測 Kimi 把「下週三」算成 08-20;08-20 是週四,08-19 才是週三
    expect(formatDueDate('2026-08-19')).toBe('2026-08-19(週三)');
    expect(formatDueDate('2026-08-20')).toBe('2026-08-20(週四)');
  });

  it('格式不是 YYYY-MM-DD 就原樣顯示,不自作聰明', () => {
    expect(formatDueDate('下週三')).toBe('下週三');
  });
});

describe('簡體字轉換', () => {
  it('模型寫出的簡體字在送去提案前就轉成繁體,並跳警告', async () => {
    const llm = fakeLlm([
      [
        {
          type: 'tool_use',
          id: 't1',
          name: 'propose_log_note',
          input: { project_id: SITE_ID, content: '水电明天进场', tags: ['水电', '进场'] },
        },
      ],
      [{ type: 'text', text: '確認?' }],
    ]);
    const tools = fakeTools({
      propose_write: okPropose,
      get_project_summary: () => ({ ok: true, data: { name: '磐頂長老教會' } }),
    });

    const r = await runAgentTurn(session(), '記一筆', deps(llm.client, tools.client));
    const sent = tools.calls.find((c) => c.tool === 'propose_write')!.body.payload as Record<string, unknown>;
    expect(sent.content).toBe('水電明天進場');
    expect(sent.tags).toEqual(['水電', '進場']);
    expect(r.warning).toContain('簡體字');
  });

  it('本來就是繁體就原樣不動,也不會跳警告', async () => {
    const llm = fakeLlm([
      [
        {
          type: 'tool_use',
          id: 't1',
          name: 'propose_log_note',
          input: { project_id: SITE_ID, content: '木作進場前先放樣' },
        },
      ],
      [{ type: 'text', text: '確認?' }],
    ]);
    const tools = fakeTools({
      propose_write: okPropose,
      get_project_summary: () => ({ ok: true, data: { name: '磐頂長老教會' } }),
    });

    const r = await runAgentTurn(session(), '記一筆', deps(llm.client, tools.client));
    const sent = tools.calls.find((c) => c.tool === 'propose_write')!.body.payload as Record<string, unknown>;
    expect(sent.content).toBe('木作進場前先放樣');
    expect(r.warning).toBeUndefined();
  });

  it('只轉字形不換詞彙:「调试」不會被改寫成「除錯」', () => {
    expect(toTraditional('调试')).toBe('調試');
    expect(toTraditional('软件')).toBe('軟件');
  });
});

describe('提案流程', () => {
  it('search → propose 成功後停在 confirming,而且沒有呼叫任何寫入工具', async () => {
    const llm = fakeLlm([
      [{ type: 'tool_use', id: 't1', name: 'search_projects', input: { query: '磐頂' } }],
      [
        {
          type: 'tool_use',
          id: 't2',
          name: 'propose_log_note',
          input: { project_id: SITE_ID, content: '木作進場前先放樣' },
        },
      ],
      [{ type: 'text', text: '要記到「磐頂長老教會」一筆工作記錄:「木作進場前先放樣」,對嗎?' }],
    ]);
    const tools = fakeTools({ search_projects: okSearch, propose_write: okPropose });

    const s = session();
    const r = await runAgentTurn(s, '幫我在磐頂記一筆,木作進場前先放樣', deps(llm.client, tools.client));

    expect(r.state).toBe('confirming');
    expect(r.pending?.action).toBe('log_note');
    expect(r.pending?.fields).toEqual([
      { label: '專案', value: '磐頂長老教會' },
      { label: '動作', value: '記一筆工作記錄' },
      { label: '內容', value: '木作進場前先放樣' },
    ]);
    expect(tools.calls.map((c) => c.tool)).toEqual(['search_projects', 'propose_write']);
    expect(tools.calls.some((c) => c.tool === 'log_note' || c.tool === 'create_task')).toBe(false);
    // LLM 就算複述成「已經記好了」,runtime 也會在前面補一句不說謊的話
    expect(r.reply.startsWith('⏳ 還沒寫入,請確認:')).toBe(true);
    // 複述那一步不給工具,保證是純文字
    expect(llm.seen[2].tools).toBeUndefined();
  });

  it('LLM 的複述若夾帶 confirmation_token,整句丟掉改用系統說明', async () => {
    const llm = fakeLlm([
      [{ type: 'tool_use', id: 't1', name: 'propose_log_note', input: { project_id: SITE_ID, content: '放樣' } }],
      [{ type: 'text', text: `已經記好了,確認碼是 ${TOKEN},60 秒內有效` }],
    ]);
    const tools = fakeTools({
      propose_write: okPropose,
      get_project_summary: () => ({ ok: true, data: { name: '磐頂長老教會' } }),
    });

    const r = await runAgentTurn(session(), '記一筆', deps(llm.client, tools.client));
    expect(r.reply).not.toContain(TOKEN);
    expect(r.reply).toContain('還沒寫入');
    expect(r.reply).toContain('磐頂長老教會');
    expect(r.warning).toContain('系統識別碼');
  });

  it('LLM 工具清單裡根本沒有 create_task / log_note', async () => {
    const llm = fakeLlm([[{ type: 'text', text: '好的' }]]);
    const tools = fakeTools({});
    await runAgentTurn(session(), '你好', deps(llm.client, tools.client));
    const names = (llm.seen[0].tools ?? []).map((t) => t.name);
    expect(names).toContain('propose_log_note');
    expect(names).not.toContain('log_note');
    expect(names).not.toContain('create_task');
  });

  it('空字串/空陣列的選填欄位不會混進 payload(避免 hash 對不上)', async () => {
    const llm = fakeLlm([
      [
        {
          type: 'tool_use',
          id: 't1',
          name: 'propose_create_task',
          input: { project_id: SITE_ID, title: '放樣', description: '', due_date: '2026-08-20' },
        },
      ],
      [{ type: 'text', text: '確認?' }],
    ]);
    const tools = fakeTools({ propose_write: okPropose, get_project_summary: () => ({ ok: true, data: { name: '磐頂長老教會' } }) });
    await runAgentTurn(session(), '新增任務', deps(llm.client, tools.client));

    const proposed = tools.calls.find((c) => c.tool === 'propose_write')!.body.payload as Record<string, unknown>;
    expect(proposed).toEqual({ project_id: SITE_ID, title: '放樣', due_date: '2026-08-20' });
  });

  it('propose 失敗時把錯誤餵回 LLM 讓它追問,不會卡在 confirming', async () => {
    const llm = fakeLlm([
      [{ type: 'tool_use', id: 't1', name: 'propose_log_note', input: { project_id: SITE_ID, content: 'x' } }],
      [{ type: 'tool_use', id: 't2', name: 'ask_clarification', input: { question: '找不到這個專案,可以換個說法嗎?' } }],
    ]);
    const tools = fakeTools({
      propose_write: () => ({ ok: false, status: 404, error_code: 'PROJECT_NOT_FOUND', message_zh: '找不到這個專案' }),
    });

    const r = await runAgentTurn(session(), '記一筆', deps(llm.client, tools.client));
    expect(r.state).toBe('clarifying');
    expect(r.toolTrace).toEqual([
      { name: 'propose_log_note', ok: false, error_code: 'PROJECT_NOT_FOUND' },
      { name: 'ask_clarification', ok: true },
    ]);
  });
});

describe('實體對齊', () => {
  it('多筆候選 → clarifying 帶可點選 options', async () => {
    const llm = fakeLlm([
      [{ type: 'tool_use', id: 't1', name: 'search_projects', input: { query: '教會' } }],
      [
        {
          type: 'tool_use',
          id: 't2',
          name: 'ask_clarification',
          input: {
            question: '找到兩個,你是指哪一個?',
            options: [
              { label: '磐頂長老教會', value: SITE_ID },
              { label: '東海教會', value: 'other-id' },
            ],
          },
        },
      ],
    ]);
    const tools = fakeTools({
      search_projects: () => ({
        ok: true,
        data: {
          candidates: [
            { id: SITE_ID, name: '磐頂長老教會' },
            { id: 'other-id', name: '東海教會' },
          ],
        },
      }),
    });

    const r = await runAgentTurn(session(), '記到教會那個案子', deps(llm.client, tools.client));
    expect(r.state).toBe('clarifying');
    expect(r.options).toEqual([
      { label: '磐頂長老教會', value: SITE_ID },
      { label: '東海教會', value: 'other-id' },
    ]);
  });

  it('查不到專案名稱時顯示查詢失敗,不拿 id 冒充案名', async () => {
    const llm = fakeLlm([
      [{ type: 'tool_use', id: 't1', name: 'propose_log_note', input: { project_id: SITE_ID, content: 'x' } }],
      [{ type: 'text', text: '確認?' }],
    ]);
    const tools = fakeTools({
      propose_write: okPropose,
      get_project_summary: () => ({ ok: false, status: 503, error_code: 'SERVICE_UNAVAILABLE', message_zh: '資料表尚未建立' }),
    });

    const r = await runAgentTurn(session(), '記一筆', deps(llm.client, tools.client));
    expect(r.pending?.fields[0].value).toContain('專案名稱查詢失敗');
    expect(r.warning).toContain('無法取得專案名稱');
  });
});

describe('確認流程', () => {
  async function arrangePending() {
    const llm = fakeLlm([
      [
        {
          type: 'tool_use',
          id: 't1',
          name: 'propose_log_note',
          input: { project_id: SITE_ID, content: '木作進場前先放樣' },
        },
      ],
      [{ type: 'text', text: '確認?' }],
    ]);
    const tools = fakeTools({
      propose_write: okPropose,
      get_project_summary: () => ({ ok: true, data: { name: '磐頂長老教會' } }),
      log_note: () => ({ ok: true, data: { note_id: 'note-1' } }),
    });
    const s = session();
    await runAgentTurn(s, '記一筆', deps(llm.client, tools.client));
    return { s, tools, llm };
  }

  it('按下確認才寫入,送出的 payload 是 canonical_echo 原樣 + token', async () => {
    const { s, tools } = await arrangePending();
    tools.calls.length = 0;

    const r = await confirmPending(s, deps(fakeLlm([]).client, tools.client));
    expect(r.state).toBe('responding');
    expect(tools.calls).toEqual([
      {
        tool: 'log_note',
        body: { project_id: SITE_ID, content: '木作進場前先放樣', confirmation_token: TOKEN },
      },
    ]);
    expect(s.pending).toBeNull();
    expect(r.reply).toContain('磐頂長老教會');
  });

  it('token 逾時 → 用相同內容重新提案再寫入,而且明講重提過', async () => {
    const { s, tools } = await arrangePending();
    tools.calls.length = 0;
    let commits = 0;
    const toolsExpiring = fakeTools({
      log_note: () => {
        commits += 1;
        return commits === 1
          ? { ok: false, status: 401, error_code: 'TOKEN_INVALID', message_zh: '確認碼已逾時' }
          : { ok: true, data: { note_id: 'note-2' } };
      },
      propose_write: () => ({
        ok: true,
        data: { confirmation_token: 'fresh-token', canonical_echo: { project_id: SITE_ID, content: '木作進場前先放樣' } },
      }),
    });

    const r = await confirmPending(s, deps(fakeLlm([]).client, toolsExpiring.client));
    expect(r.state).toBe('responding');
    expect(r.warning).toContain('逾時');
    expect(commits).toBe(2);
    const relayed = toolsExpiring.calls.filter((c) => c.tool === 'log_note');
    expect(relayed[1].body.confirmation_token).toBe('fresh-token');
    // 重提用的是原本的 payload,不是重新讓 LLM 生一份
    expect(toolsExpiring.calls[1].body.payload).toEqual({ project_id: SITE_ID, content: '木作進場前先放樣' });
  });

  it('寫入失敗時明講失敗,不會回「已記錄」', async () => {
    const { s } = await arrangePending();
    const failing = fakeTools({
      log_note: () => ({ ok: false, status: 401, error_code: 'TOKEN_PAYLOAD_MISMATCH', message_zh: '內容跟確認時不一樣了' }),
      propose_write: () => ({ ok: false, status: 500, error_code: 'BAD_REQUEST', message_zh: '爆炸' }),
    });
    const r = await confirmPending(s, deps(fakeLlm([]).client, failing.client));
    expect(r.reply).toContain('寫入失敗');
    expect(r.reply).not.toContain('已記錄');
    expect(s.pending).toBeNull();
  });

  it('取消 → 不寫入,提案作廢', async () => {
    const { s, tools } = await arrangePending();
    tools.calls.length = 0;
    const r = cancelPending(s);
    expect(r.state).toBe('responding');
    expect(s.pending).toBeNull();
    expect(tools.calls).toHaveLength(0);
  });

  it('沒有 pending 時按確認不會亂寫東西', async () => {
    const tools = fakeTools({});
    const r = await confirmPending(session('empty'), deps(fakeLlm([]).client, tools.client));
    expect(r.reply).toContain('沒有待確認');
    expect(tools.calls).toHaveLength(0);
  });

  it('確認前又打字 → 舊提案作廢,不會被後續確認寫進去', async () => {
    const { s, tools } = await arrangePending();
    tools.calls.length = 0;
    const llm2 = fakeLlm([[{ type: 'text', text: '好,那我重新確認一次' }]]);
    await runAgentTurn(s, '不是,改成放樣後才進場', deps(llm2.client, tools.client));
    expect(s.pending).toBeNull();

    const r = await confirmPending(s, deps(fakeLlm([]).client, tools.client));
    expect(r.reply).toContain('沒有待確認');
    expect(tools.calls.some((c) => c.tool === 'log_note')).toBe(false);
  });
});

describe('把 agent 約束在正軌上', () => {
  it('沒查過任何東西就想講話 → 換成固定文案,不讓它自由發揮', async () => {
    const llm = fakeLlm([
      [{ type: 'tool_use', id: 't1', name: 'respond', input: { text: '哈哈,貓跟狗都很棒!你是貓派還是狗派?' } }],
    ]);
    const tools = fakeTools({});
    const r = await runAgentTurn(session(), '貓跟狗你喜歡誰', deps(llm.client, tools.client));

    expect(r.reply).not.toContain('貓派');
    expect(r.reply).toContain('現場記錄助理');
    expect(r.warning).toContain('沒有查詢任何資料');
  });

  it('查過東西才准講,而且講的是模型那句話', async () => {
    const llm = fakeLlm([
      [{ type: 'tool_use', id: 't1', name: 'list_tasks', input: { project_id: SITE_ID } }],
      [{ type: 'tool_use', id: 't2', name: 'respond', input: { text: '磐頂長老教會目前有 2 個未完成任務。' } }],
    ]);
    const tools = fakeTools({ list_tasks: () => ({ ok: true, data: { tasks: [], total: 2 } }) });
    const r = await runAgentTurn(session(), '磐頂還有幾個任務沒做', deps(llm.client, tools.client));

    expect(r.reply).toBe('磐頂長老教會目前有 2 個未完成任務。');
    expect(r.warning).toBeUndefined();
  });

  it('decline 的話是系統講的,模型只給分類', async () => {
    const llm = fakeLlm([[{ type: 'tool_use', id: 't1', name: 'decline', input: { reason: 'unsupported_action' } }]]);
    const r = await runAgentTurn(session(), '幫我把金額改成三萬', deps(llm.client, fakeTools({}).client));
    expect(r.reply).toBe('這個操作目前不支援,請用系統介面。');
  });

  it('模型不理會 tool_choice、直接回自由文字時,一樣過閘門', async () => {
    const llm = fakeLlm([[{ type: 'text', text: '我覺得狗比較忠心耶' }]]);
    const r = await runAgentTurn(session(), '你喜歡狗嗎', deps(llm.client, fakeTools({}).client));
    expect(r.reply).not.toContain('忠心');
    expect(r.warning).toContain('沒有查詢任何資料');
  });

  // 民生(時間/天氣)與救難的兩個測試在 2026-08-14 隨那三個工具一起移除。
  // 見 voice-agent-tools.ts 的 READ_TOOLS 註解:加入民生救難後 Kimi 辨答率下降,
  // 決定回退到只做 wu 現場記錄。日後若真的要做民生救難,規劃獨立入口的 agent。

  it('每一輪都強制模型只能透過工具說話', async () => {
    const llm = fakeLlm([[{ type: 'tool_use', id: 't1', name: 'decline', input: { reason: 'chitchat' } }]]);
    await runAgentTurn(session(), '你好', deps(llm.client, fakeTools({}).client));
    expect(llm.seen[0].toolChoice).toBe('any');
  });
});

describe('語音口令確認(Lab 3 雙軌的 B 軌)', () => {
  it('名單內的明確肯定才算確認', () => {
    for (const w of ['確認', '確定', '對', '沒錯', '可以', '沒問題', '就這樣']) {
      expect(matchVoiceCommand(w), w).toBe('confirm');
    }
  });

  it('否定詞絕對不能被當成同意——「不對」包含「對」、「不可以」包含「可以」', () => {
    // 這是整個口令設計最危險的地方:用包含比對就會把否定聽成同意
    expect(matchVoiceCommand('不對')).toBe('cancel');
    expect(matchVoiceCommand('不是')).toBe('cancel');
    expect(matchVoiceCommand('不可以')).toBe('unclear'); // 不在任一名單 → 不動作,再問一次
    expect(matchVoiceCommand('不要')).toBe('cancel');
  });

  it('模糊回應一律 unclear(handoff §5.4)', () => {
    for (const w of ['嗯', '應該吧', '大概', '好像可以吧', '我想想']) {
      expect(matchVoiceCommand(w), w).toBe('unclear');
    }
  });

  it('剝語尾助詞,但不做語意推論', () => {
    expect(matchVoiceCommand('對啊')).toBe('confirm');
    expect(matchVoiceCommand('可以啦')).toBe('confirm');
    expect(matchVoiceCommand('取消啦')).toBe('cancel');
    expect(matchVoiceCommand('應該吧')).toBe('unclear'); // 「吧」不剝,剝了也不在名單
  });

  it('STT 送來簡體字也認得', () => {
    expect(matchVoiceCommand('确认')).toBe('confirm');
    expect(matchVoiceCommand('没错')).toBe('confirm');
  });

  it('聽不清楚時不動 pending,狀態留在 confirming 讓使用者再講一次', async () => {
    const llm = fakeLlm([
      [{ type: 'tool_use', id: 't1', name: 'propose_log_note', input: { project_id: SITE_ID, content: '放樣' } }],
      [{ type: 'text', text: '確認?' }],
    ]);
    const tools = fakeTools({
      propose_write: okPropose,
      get_project_summary: () => ({ ok: true, data: { name: '磐頂長老教會' } }),
      log_note: () => ({ ok: true, data: { note_id: 'n1' } }),
    });
    const s = session();
    await runAgentTurn(s, '記一筆', deps(llm.client, tools.client));
    tools.calls.length = 0;

    const r = await handleVoiceCommand(s, '應該吧', deps(llm.client, tools.client));
    expect(r.state).toBe('confirming');
    expect(s.pending).not.toBeNull();
    expect(tools.calls).toHaveLength(0);
    expect(r.warning).toContain('應該吧');
  });

  it('說「確認」才真的寫入', async () => {
    const llm = fakeLlm([
      [{ type: 'tool_use', id: 't1', name: 'propose_log_note', input: { project_id: SITE_ID, content: '放樣' } }],
      [{ type: 'text', text: '確認?' }],
    ]);
    const tools = fakeTools({
      propose_write: okPropose,
      get_project_summary: () => ({ ok: true, data: { name: '磐頂長老教會' } }),
      log_note: () => ({ ok: true, data: { note_id: 'n1' } }),
    });
    const s = session();
    await runAgentTurn(s, '記一筆', deps(llm.client, tools.client));
    tools.calls.length = 0;

    const r = await handleVoiceCommand(s, '確認', deps(llm.client, tools.client));
    expect(r.reply).toContain('已記錄');
    expect(tools.calls.map((c) => c.tool)).toEqual(['log_note']);
    expect(s.pending).toBeNull();
  });
});

describe('情境式工具子集(Lab 4 §3)', () => {
  it('resolveContext:來源頁面對到情境,對不到就退回 default', () => {
    expect(resolveContext('/boss/equipment')).toBe('equipment');
    expect(resolveContext('/boss/equipment/123')).toBe('equipment');
    expect(resolveContext('/boss/clockins')).toBe('clockins');
    expect(resolveContext('/boss/ledger')).toBe('default');
    expect(resolveContext(undefined)).toBe('default');
    expect(resolveContext(null)).toBe('default');
  });

  it('equipment 情境:模型看不到 search_projects 以外的讀取工具或任何 propose_*', async () => {
    const llm = fakeLlm([
      [{ type: 'tool_use', id: 't1', name: 'search_equipment', input: { query: 'JBL' } }],
      [{ type: 'text', text: '找到了' }],
    ]);
    const tools = fakeTools({
      search_equipment: () => ({ ok: true, data: { candidates: [{ id: 'e1', name: 'JBL 喇叭', site_name: '磐頂' }] } }),
    });
    await runAgentTurn(session(), 'JBL 喇叭在哪', deps(llm.client, tools.client), 'equipment');

    const toolNames = (llm.seen[0].tools ?? []).map((t) => t.name);
    expect(toolNames).toContain('search_equipment');
    expect(toolNames).not.toContain('list_tasks');
    expect(toolNames).not.toContain('propose_create_task');
    expect(toolNames).not.toContain('get_today_clockins');
  });

  it('clockins 情境:模型只看得到 get_today_clockins 這個讀取工具,拿不到寫入工具', async () => {
    const llm = fakeLlm([[{ type: 'text', text: '今天沒有人打卡' }]]);
    const tools = fakeTools({});
    await runAgentTurn(session(), '今天誰打卡了', deps(llm.client, tools.client), 'clockins');

    const toolNames = (llm.seen[0].tools ?? []).map((t) => t.name);
    expect(toolNames).toContain('get_today_clockins');
    expect(toolNames).not.toContain('search_equipment');
    expect(toolNames).not.toContain('propose_log_note');
  });

  it('default 情境(未傳 context)維持 Lab 2 原本的工具清單,不受 Lab 4 影響', async () => {
    const llm = fakeLlm([[{ type: 'text', text: '(閒聊擋下)' }]]);
    const tools = fakeTools({});
    await runAgentTurn(session(), '你好', deps(llm.client, tools.client));

    const toolNames = (llm.seen[0].tools ?? []).map((t) => t.name);
    expect(toolNames).toEqual(
      expect.arrayContaining(['search_projects', 'get_project_summary', 'list_tasks', 'propose_create_task', 'propose_log_note']),
    );
    expect(toolNames).not.toContain('search_equipment');
    expect(toolNames).not.toContain('get_today_clockins');
  });
});

describe('收斂保護', () => {
  it('LLM 一直呼叫工具不收斂 → 停下來明講,不假裝有結論', async () => {
    const loop: LlmContentBlock[][] = Array.from({ length: 12 }, (_, i) => [
      { type: 'tool_use' as const, id: `t${i}`, name: 'search_projects', input: { query: 'x' } },
    ]);
    const llm = fakeLlm(loop);
    const tools = fakeTools({ search_projects: () => ({ ok: true, data: { candidates: [] } }) });

    const r = await runAgentTurn(session(), '記一筆', deps(llm.client, tools.client));
    expect(r.state).toBe('responding');
    expect(r.warning).toContain('工具呼叫上限');
    expect(r.reply).toContain('沒有寫入');
    expect(tools.calls).toHaveLength(8);
  });
});
