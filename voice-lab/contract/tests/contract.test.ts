/**
 * 工具面契約測試 v1.0
 *
 * 用法:VOICE_BASE_URL=http://localhost:8787 API_KEY=dev-key npm test
 * 同一套測試跑 mock(Lab 1)與 PM 系統真實作——兩邊都綠才算契約達成。
 *
 * QUERY 預設 '王' 是 Lab 0 原始通用範例資料的假設(見 tool-contract-v1.md 範例);
 * 對著 wu 真實後端跑時,傳 VOICE_TEST_QUERY 指向一個真的存在、active=true 的 site 名稱片段。
 */
import { describe, it, expect } from 'vitest';

const BASE = process.env.VOICE_BASE_URL ?? 'http://localhost:8787';
const KEY = process.env.API_KEY ?? 'dev-key';
const QUERY = process.env.VOICE_TEST_QUERY ?? '王';

async function call(tool: string, body: unknown): Promise<{ status: number; json: any; version: string | null }> {
  const res = await fetch(`${BASE}/tools/${tool}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})), version: res.headers.get('x-contract-version') };
}

/** 走完整兩階段流程的 helper */
async function propose(action: string, payload: object) {
  return call('propose_write', { action, payload });
}

describe('通用', () => {
  it('無 API key 一律 401', async () => {
    const res = await fetch(`${BASE}/tools/search_projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: QUERY }),
    });
    expect(res.status).toBe(401);
  });

  it('回應帶契約版本 1.x', async () => {
    const { version } = await call('search_projects', { query: QUERY });
    expect(version).toMatch(/^1\./);
  });
});

describe('讀取工具', () => {
  it('search_projects 候選 ≤ 5 且含必要欄位', async () => {
    const { status, json } = await call('search_projects', { query: QUERY });
    expect(status).toBe(200);
    expect(json.candidates.length).toBeLessThanOrEqual(5);
    for (const c of json.candidates) {
      expect(c).toHaveProperty('id');
      expect(c).toHaveProperty('name');
      expect(c).toHaveProperty('status');
      expect(c).toHaveProperty('client_name');
    }
  });

  it('search_projects 查無 → 空陣列非錯誤', async () => {
    const { status, json } = await call('search_projects', { query: 'zzz不存在zzz' });
    expect(status).toBe(200);
    expect(json.candidates).toEqual([]);
  });

  it('list_tasks ≤ 10 筆且帶 total', async () => {
    const { json: s } = await call('search_projects', { query: QUERY });
    const pid = s.candidates[0]?.id;
    expect(pid).toBeTruthy();
    const { status, json } = await call('list_tasks', { project_id: pid });
    expect(status).toBe(200);
    expect(json.tasks.length).toBeLessThanOrEqual(10);
    expect(typeof json.total).toBe('number');
  });

  it('get_project_summary 最近更新 ≤ 3 筆', async () => {
    const { json: s } = await call('search_projects', { query: QUERY });
    const { status, json } = await call('get_project_summary', { project_id: s.candidates[0].id });
    expect(status).toBe(200);
    expect(json.recent_updates.length).toBeLessThanOrEqual(3);
  });

  it('不存在的 project_id → 404 PROJECT_NOT_FOUND', async () => {
    const { status, json } = await call('get_project_summary', { project_id: 'no-such-id' });
    expect(status).toBe(404);
    expect(json.error_code).toBe('PROJECT_NOT_FOUND');
    expect(typeof json.message_zh).toBe('string');
  });
});

describe('兩階段寫入 — token 由伺服器簽發', () => {
  async function firstProjectId(): Promise<string> {
    const { json } = await call('search_projects', { query: QUERY });
    return json.candidates[0].id;
  }

  it('無 token 寫入 100% 拒絕', async () => {
    const pid = await firstProjectId();
    const { status, json } = await call('log_note', { project_id: pid, content: '測試' });
    expect(status).toBe(401);
    expect(json.error_code).toBe('TOKEN_REQUIRED');
  });

  it('亂寫的 token → TOKEN_INVALID', async () => {
    const pid = await firstProjectId();
    const { status, json } = await call('log_note', { project_id: pid, content: '測試', confirmation_token: 'fake-token' });
    expect(status).toBe(401);
    expect(json.error_code).toBe('TOKEN_INVALID');
  });

  it('propose → commit 正常流程,回 note_id', async () => {
    const pid = await firstProjectId();
    const payload = { project_id: pid, content: '現場口述:木作進場前要先放樣' };
    const p = await propose('log_note', payload);
    expect(p.status).toBe(200);
    expect(p.json.confirmation_token).toBeTruthy();
    expect(p.json.canonical_echo).toBeTruthy();
    const c = await call('log_note', { ...payload, confirmation_token: p.json.confirmation_token });
    expect(c.status).toBe(200);
    expect(c.json.note_id).toBeTruthy();
  });

  it('payload 在確認後被改 → TOKEN_PAYLOAD_MISMATCH', async () => {
    const pid = await firstProjectId();
    const payload = { project_id: pid, content: '原始內容' };
    const p = await propose('log_note', payload);
    const c = await call('log_note', { project_id: pid, content: '被偷改的內容', confirmation_token: p.json.confirmation_token });
    expect(c.status).toBe(401);
    expect(c.json.error_code).toBe('TOKEN_PAYLOAD_MISMATCH');
  });

  it('同一 token 重試 → 冪等回原結果,不重複寫入', async () => {
    const pid = await firstProjectId();
    const payload = { project_id: pid, content: '冪等測試' };
    const p = await propose('log_note', payload);
    const body = { ...payload, confirmation_token: p.json.confirmation_token };
    const c1 = await call('log_note', body);
    const c2 = await call('log_note', body);
    expect(c1.status).toBe(200);
    expect(c2.status).toBe(200);
    expect(c2.json.note_id).toBe(c1.json.note_id);
  });

  it('create_task 帶 due_date,canonical_echo 回顯絕對日期', async () => {
    const pid = await firstProjectId();
    const payload = { project_id: pid, title: '訂丈量時間', due_date: '2026-08-15' };
    const p = await propose('create_task', payload);
    expect(p.status).toBe(200);
    expect(p.json.canonical_echo.due_date).toBe('2026-08-15');
    const c = await call('create_task', { ...payload, confirmation_token: p.json.confirmation_token });
    expect(c.status).toBe(200);
    expect(c.json.task_id).toBeTruthy();
  });

  it('propose 對不存在的 project → 404,不簽發 token', async () => {
    const p = await propose('log_note', { project_id: 'no-such-id', content: 'x' });
    expect(p.status).toBe(404);
    expect(p.json.confirmation_token).toBeUndefined();
  });
});
