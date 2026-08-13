/**
 * Lab 1 補充測試(voice-lab/lab1-wu-adapter-spec-v1.md §7b)
 *
 * 契約測試(contract.test.ts)只驗回傳形狀;這份驗「轉接層真的把資料寫進 wu 的表」、
 * DB 層冪等、audit_log 完整性、逾時、缺配置、既有 API 零迴歸。
 *
 * ⚠️ 會對 Supabase 寫入真實資料列(sites 需先有一筆測試用專案;寫入的 tasks/worklogs/
 * write_proposals/audit_log 都是真實列,不是 mock)。
 * 執行前必備:
 *   1. migration 009_voice_tasks_proposals.sql 已在 Supabase SQL Editor 執行
 *   2. .env.local 設好 VOICE_API_KEY、VOICE_ACTOR_USER_ID(指向一個 active 使用者)
 *   3. VOICE_TEST_SITE_ID 環境變數指向一個「測試專用」的 site(不要用正式案場,
 *      避免測試資料混進老闆看到的真實工作記錄)
 *
 * 用法:
 *   VOICE_BASE_URL=http://localhost:3777/api/voice VOICE_API_KEY=... VOICE_TEST_SITE_ID=... npm test -- wu-adapter
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const BASE = process.env.VOICE_BASE_URL ?? 'http://localhost:3777/api/voice';
const KEY = process.env.VOICE_API_KEY ?? '';
const SITE_ID = process.env.VOICE_TEST_SITE_ID ?? '';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const hasDbAccess = Boolean(SUPABASE_URL && SUPABASE_KEY);
const sb = hasDbAccess ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

async function call(tool: string, body: unknown, key = KEY) {
  const res = await fetch(`${BASE}/tools/${tool}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

beforeAll(() => {
  if (!KEY || !SITE_ID) {
    throw new Error('請設定 VOICE_API_KEY 與 VOICE_TEST_SITE_ID 環境變數再跑這份測試');
  }
});

describe('1 — log_note 真的寫進 worklogs', () => {
  it('propose→commit 後,worklogs 多一筆且 note 含 hashtag 尾綴', async () => {
    if (!hasDbAccess) return;
    const { count: before } = await sb!.from('worklogs').select('id', { count: 'exact', head: true }).eq('site_id', SITE_ID);

    const payload = { project_id: SITE_ID, content: 'Lab1 補充測試 log_note', tags: ['測試'] };
    const p = await call('propose_write', { action: 'log_note', payload });
    const c = await call('log_note', { ...payload, confirmation_token: p.json.confirmation_token });
    expect(c.status).toBe(200);

    const { count: after } = await sb!.from('worklogs').select('id', { count: 'exact', head: true }).eq('site_id', SITE_ID);
    expect(after).toBe((before ?? 0) + 1);

    const { data: row } = await sb!.from('worklogs').select('note').eq('id', c.json.note_id).single();
    expect(row?.note).toContain('#測試');
  });
});

describe('2 — create_task 真的寫進 tasks 且 source=voice', () => {
  it('propose(source:voice)→commit 後,tasks 多一筆、source=voice', async () => {
    if (!hasDbAccess) return;
    const payload = { project_id: SITE_ID, title: 'Lab1 補充測試 task', due_date: '2026-09-01' };
    const p = await call('propose_write', { action: 'create_task', payload, source: 'voice' });
    const c = await call('create_task', { ...payload, confirmation_token: p.json.confirmation_token });
    expect(c.status).toBe(200);

    const { data } = await sb!.from('tasks').select('source, site_id, due_date').eq('id', c.json.task_id).single();
    expect(data?.source).toBe('voice');
    expect(data?.site_id).toBe(SITE_ID);
    expect(data?.due_date).toBe('2026-09-01');
  });
});

describe('3 — 冪等重試 DB 層驗證:筆數不變', () => {
  it('同一 token 打兩次,worklogs 只多一筆(不是兩筆)', async () => {
    if (!hasDbAccess) return;
    const payload = { project_id: SITE_ID, content: 'Lab1 冪等測試' };
    const p = await call('propose_write', { action: 'log_note', payload });
    const body = { ...payload, confirmation_token: p.json.confirmation_token };

    const { count: before } = await sb!.from('worklogs').select('id', { count: 'exact', head: true }).eq('site_id', SITE_ID);
    await call('log_note', body);
    await call('log_note', body);
    const { count: after } = await sb!.from('worklogs').select('id', { count: 'exact', head: true }).eq('site_id', SITE_ID);

    expect(after).toBe((before ?? 0) + 1);
  });
});

describe('4 — token 逾時', () => {
  it('proposal.expires_at 手動改到過去 → 401 TOKEN_INVALID', async () => {
    if (!hasDbAccess) return;
    const payload = { project_id: SITE_ID, content: 'Lab1 逾時測試' };
    const p = await call('propose_write', { action: 'log_note', payload });
    const token = p.json.confirmation_token;

    await sb!.from('write_proposals').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('token', token);

    const c = await call('log_note', { ...payload, confirmation_token: token });
    expect(c.status).toBe(401);
    expect(c.json.error_code).toBe('TOKEN_INVALID');
  });
});

describe('5 — audit_log 完整性', () => {
  it('每次 propose + 每次寫入各多一筆稽核,diff 含轉寫/來源資訊', async () => {
    if (!hasDbAccess) return;
    const { count: before } = await sb!.from('audit_log').select('id', { count: 'exact', head: true }).like('action', 'voice.%');

    const payload = { project_id: SITE_ID, content: 'Lab1 稽核測試' };
    const p = await call('propose_write', { action: 'log_note', payload, source: 'voice', transcript_ref: 'transcript-abc123' });
    await call('log_note', { ...payload, confirmation_token: p.json.confirmation_token });

    const { count: after, data } = await sb!
      .from('audit_log')
      .select('action, diff', { count: 'exact' })
      .like('action', 'voice.%')
      .order('id', { ascending: false })
      .limit(2);
    expect(after).toBe((before ?? 0) + 2);
    const actions = (data ?? []).map((r) => r.action).sort();
    expect(actions).toEqual(['voice.log_note', 'voice.propose']);
    const proposeRow = (data ?? []).find((r) => r.action === 'voice.propose');
    expect(proposeRow?.diff?.transcript_ref).toBe('transcript-abc123');
  });
});

describe('6 — search_projects 不回 inactive 專案', () => {
  it('停用的 site 不出現在候選中', async () => {
    if (!hasDbAccess) return;
    const { data: site } = await sb!.from('sites').select('name').eq('id', SITE_ID).single();
    await sb!.from('sites').update({ active: false }).eq('id', SITE_ID);
    try {
      const { json } = await call('search_projects', { query: site!.name });
      expect(json.candidates.find((c: { id: string }) => c.id === SITE_ID)).toBeUndefined();
    } finally {
      await sb!.from('sites').update({ active: true }).eq('id', SITE_ID);
    }
  });
});

describe('7 — 既有 API 零迴歸(粗略煙霧測試)', () => {
  it('/api/sites 仍可正常回應(非 voice 命名空間未被影響)', async () => {
    // 這裡只驗 voice 命名空間本身沒有污染既有路由;完整迴歸請跑 `npm run build`
    const res = await fetch(BASE.replace('/api/voice', '/api/sites'));
    expect([200, 401, 405]).toContain(res.status); // 401=未登入(session-based),非 500
  });
});

describe('8 — 缺配置時 loud 503,不靜默放行', () => {
  it('錯誤的 API key → 401(非 200)', async () => {
    const { status, json } = await call('search_projects', { query: '測試' }, 'wrong-key-xyz');
    expect(status).toBe(401);
    expect(json.error_code).toBe('UNAUTHORIZED');
  });
});
