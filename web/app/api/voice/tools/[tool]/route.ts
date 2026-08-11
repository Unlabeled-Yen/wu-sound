import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  authenticateVoiceRequest,
  canonicalJson,
  dbErrorResponse,
  payloadHash,
  voiceError,
  withVersion,
} from '@/lib/voice';

export const runtime = 'nodejs';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PROPOSAL_TTL_MS = 60_000;

type Json = Record<string, unknown>;

function ok(body: unknown, status = 200): NextResponse {
  return withVersion(NextResponse.json(body, { status }));
}

async function parseBody(req: Request): Promise<Json | null> {
  try {
    const j = await req.json();
    return j && typeof j === 'object' ? (j as Json) : {};
  } catch {
    return null;
  }
}

// ---------- 讀取工具 ----------

async function searchProjects(sb: SupabaseClient, body: Json): Promise<NextResponse> {
  const query = typeof body.query === 'string' ? body.query.trim() : '';
  if (!query) return voiceError('BAD_REQUEST', '請提供搜尋關鍵字', 400);

  const like = `%${query.replace(/[%_]/g, '')}%`;
  const { data, error } = await sb
    .from('sites')
    .select('id, name, active')
    .eq('active', true)
    .ilike('name', like)
    .limit(20);
  if (error) return dbErrorResponse(error);

  const rows = (data ?? []) as { id: string; name: string; active: boolean }[];
  const q = query.toLowerCase();
  rows.sort((a, b) => {
    const aPrefix = a.name.toLowerCase().startsWith(q) ? 0 : 1;
    const bPrefix = b.name.toLowerCase().startsWith(q) ? 0 : 1;
    if (aPrefix !== bPrefix) return aPrefix - bPrefix;
    return a.name.localeCompare(b.name, 'zh-Hant');
  });

  const candidates = rows.slice(0, 5).map((r) => ({
    id: r.id,
    name: r.name,
    status: 'active',
    client_name: null, // wu 的 sites 不記客戶名(已知缺口,見 spec §2)
  }));
  return ok({ candidates });
}

async function findActiveSite(sb: SupabaseClient, siteId: string) {
  return sb.from('sites').select('id, name, active').eq('id', siteId).maybeSingle();
}

async function getProjectSummary(sb: SupabaseClient, body: Json): Promise<NextResponse> {
  const projectId = typeof body.project_id === 'string' ? body.project_id : '';
  if (!projectId) return voiceError('BAD_REQUEST', '缺少 project_id', 400);

  const { data: site, error: siteErr } = await findActiveSite(sb, projectId);
  if (siteErr) return dbErrorResponse(siteErr);
  if (!site || !site.active) return voiceError('PROJECT_NOT_FOUND', '找不到這個專案', 404);

  // 注意:count-only 查詢不可用 { head: true } —— PostgREST 對不存在的表在
  // HEAD 請求下會回 204 + error:null + count:null(已實測確認),等於把「表不存在」
  // 偽裝成「0 筆」,是活生生的靜默失效。改用一般 select 讓錯誤能正常浮現。
  const { data: openTaskRows, count: openTaskCount, error: taskErr } = await sb
    .from('tasks')
    .select('id', { count: 'exact' })
    .eq('site_id', projectId)
    .eq('status', 'open');
  if (taskErr) return dbErrorResponse(taskErr);
  if (openTaskCount === null && openTaskRows === null) {
    return voiceError('SERVICE_UNAVAILABLE', 'voice 資料表狀態異常,無法確認任務數', 503);
  }

  const { data: recent, error: wlErr } = await sb
    .from('worklogs')
    .select('logged_on, note')
    .eq('site_id', projectId)
    .order('logged_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(3);
  if (wlErr) return dbErrorResponse(wlErr);

  const recentUpdates = ((recent ?? []) as { logged_on: string; note: string }[]).map((w) => ({
    ts: w.logged_on,
    summary: w.note.length > 60 ? `${w.note.slice(0, 60)}…` : w.note,
  }));

  return ok({
    name: site.name,
    status: 'active',
    open_task_count: openTaskCount ?? 0,
    recent_updates: recentUpdates,
  });
}

async function listTasks(sb: SupabaseClient, body: Json): Promise<NextResponse> {
  const projectId = typeof body.project_id === 'string' ? body.project_id : '';
  if (!projectId) return voiceError('BAD_REQUEST', '缺少 project_id', 400);
  const statusFilter = body.status === 'all' || body.status === 'done' ? body.status : 'open';

  const { data: site, error: siteErr } = await findActiveSite(sb, projectId);
  if (siteErr) return dbErrorResponse(siteErr);
  if (!site || !site.active) return voiceError('PROJECT_NOT_FOUND', '找不到這個專案', 404);

  let q = sb
    .from('tasks')
    .select('id, title, status, due_date', { count: 'exact' })
    .eq('site_id', projectId)
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(10);
  if (statusFilter !== 'all') q = q.eq('status', statusFilter);

  const { data, count, error } = await q;
  if (error) return dbErrorResponse(error);

  return ok({ tasks: data ?? [], total: count ?? (data ?? []).length });
}

// ---------- 寫入:propose ----------

function validateWritePayload(action: string, payload: Json): string | null {
  if (typeof payload.project_id !== 'string' || !payload.project_id) return '缺少 project_id';
  if (action === 'create_task') {
    if (typeof payload.title !== 'string' || !payload.title.trim()) return '缺少 title';
    if (payload.due_date !== undefined && payload.due_date !== null) {
      if (typeof payload.due_date !== 'string' || !DATE_RE.test(payload.due_date)) {
        return 'due_date 格式須為 YYYY-MM-DD';
      }
    }
    return null;
  }
  if (action === 'log_note') {
    if (typeof payload.content !== 'string' || !payload.content.trim()) return '缺少 content';
    return null;
  }
  return `不支援的 action: ${action}`;
}

async function proposeWrite(sb: SupabaseClient, actorId: string, body: Json): Promise<NextResponse> {
  const action = body.action;
  if (action !== 'create_task' && action !== 'log_note') {
    return voiceError('BAD_REQUEST', 'action 須為 create_task 或 log_note', 400);
  }
  const payload = (body.payload && typeof body.payload === 'object' ? body.payload : {}) as Json;

  const validationError = validateWritePayload(action, payload);
  if (validationError) return voiceError('BAD_REQUEST', validationError, 400);

  const { data: site, error: siteErr } = await findActiveSite(sb, payload.project_id as string);
  if (siteErr) return dbErrorResponse(siteErr);
  if (!site || !site.active) return voiceError('PROJECT_NOT_FOUND', '找不到這個專案', 404);

  const source = body.source === 'voice' ? 'voice' : 'text';
  const transcriptRef = typeof body.transcript_ref === 'string' ? body.transcript_ref : null;
  const capRef = typeof payload.capture_ref === 'string' ? payload.capture_ref : null;

  const hash = payloadHash(payload);
  const expiresAt = new Date(Date.now() + PROPOSAL_TTL_MS).toISOString();

  const { data: proposal, error: insErr } = await sb
    .from('write_proposals')
    .insert({
      action,
      payload,
      payload_hash: hash,
      actor_id: actorId,
      source,
      transcript_ref: transcriptRef,
      capture_ref: capRef,
      expires_at: expiresAt,
    })
    .select('token')
    .single();
  if (insErr) return dbErrorResponse(insErr);

  await sb.from('audit_log').insert({
    actor_id: actorId,
    action: 'voice.propose',
    target_table: 'write_proposals',
    target_id: proposal.token,
    diff: { params: payload, source, transcript_ref: transcriptRef, capture_ref: capRef },
  });

  const canonicalEcho: Json = { ...payload };

  return ok({
    confirmation_token: proposal.token,
    canonical_echo: canonicalEcho,
    expires_in_seconds: 60,
  });
}

// ---------- 寫入:commit(create_task / log_note) ----------

interface ProposalRow {
  token: string;
  action: string;
  payload: Json;
  payload_hash: string;
  actor_id: string;
  source: string;
  transcript_ref: string | null;
  capture_ref: string | null;
  expires_at: string;
  used_at: string | null;
  result: Json | null;
}

async function loadProposal(sb: SupabaseClient, token: unknown): Promise<
  { row: ProposalRow } | { errorResponse: NextResponse }
> {
  if (typeof token !== 'string' || !token) {
    return { errorResponse: voiceError('TOKEN_REQUIRED', '缺少 confirmation_token', 401) };
  }
  const { data, error } = await sb.from('write_proposals').select('*').eq('token', token).maybeSingle();
  if (error) return { errorResponse: dbErrorResponse(error) };
  if (!data) return { errorResponse: voiceError('TOKEN_INVALID', '找不到這個確認碼', 401) };
  return { row: data as ProposalRow };
}

async function commitWrite(
  sb: SupabaseClient,
  actorId: string,
  action: 'create_task' | 'log_note',
  body: Json,
): Promise<NextResponse> {
  const loaded = await loadProposal(sb, body.confirmation_token);
  if ('errorResponse' in loaded) return loaded.errorResponse;
  const proposal = loaded.row;

  if (proposal.action !== action) {
    return voiceError('TOKEN_INVALID', '這個確認碼不是給這個動作用的', 401);
  }

  // payload 給的內容 = body 扣掉 confirmation_token / source / transcript_ref 等中繼欄位
  const { confirmation_token: _t, source: _s, transcript_ref: _tr, ...incomingPayload } = body;
  void _t; void _s; void _tr;
  const incomingHash = payloadHash(incomingPayload as Json);

  if (proposal.used_at) {
    // 已消費過:同內容重試 → 冪等回原結果;不同內容 → 拒絕(token 不可重複用於新內容)
    if (incomingHash === proposal.payload_hash && proposal.result) {
      return ok(proposal.result);
    }
    return voiceError('TOKEN_INVALID', '這個確認碼已經用過了', 401);
  }

  if (new Date(proposal.expires_at).getTime() < Date.now()) {
    return voiceError('TOKEN_INVALID', '確認碼已逾時,請重新確認一次', 401);
  }

  if (incomingHash !== proposal.payload_hash) {
    return voiceError('TOKEN_PAYLOAD_MISMATCH', '內容跟確認時不一樣了,請重新複述確認', 401);
  }

  const payload = proposal.payload;
  const { data: site, error: siteErr } = await findActiveSite(sb, payload.project_id as string);
  if (siteErr) return dbErrorResponse(siteErr);
  if (!site || !site.active) return voiceError('PROJECT_NOT_FOUND', '找不到這個專案', 404);

  let result: Json;
  if (action === 'create_task') {
    const { data, error } = await sb
      .from('tasks')
      .insert({
        site_id: payload.project_id,
        title: payload.title,
        description: payload.description ?? null,
        due_date: payload.due_date ?? null,
        created_by: actorId,
        source: proposal.source,
      })
      .select('id')
      .single();
    if (error) return dbErrorResponse(error);
    result = { task_id: data.id as string };
  } else {
    const tags = Array.isArray(payload.tags) ? (payload.tags as string[]) : [];
    const tagSuffix = tags.length > 0 ? ` ${tags.map((t) => `#${t}`).join(' ')}` : '';
    const { data, error } = await sb
      .from('worklogs')
      .insert({
        user_id: actorId,
        site_id: payload.project_id,
        note: `${payload.content}${tagSuffix}`,
        photos: [],
      })
      .select('id')
      .single();
    if (error) return dbErrorResponse(error);
    result = { note_id: data.id as string };
  }

  await sb
    .from('write_proposals')
    .update({ used_at: new Date().toISOString(), result })
    .eq('token', proposal.token);

  await sb.from('audit_log').insert({
    actor_id: actorId,
    action: `voice.${action}`,
    target_table: action === 'create_task' ? 'tasks' : 'worklogs',
    target_id: action === 'create_task' ? (result.task_id as string) : (result.note_id as string),
    diff: {
      params: payload,
      source: proposal.source,
      transcript_ref: proposal.transcript_ref,
      capture_ref: proposal.capture_ref,
      proposal_token: proposal.token,
    },
  });

  return ok(result);
}

// ---------- dispatch ----------

const READ_TOOLS = new Set(['search_projects', 'get_project_summary', 'list_tasks']);
const WRITE_TOOLS = new Set(['create_task', 'log_note']);

export async function POST(req: Request, ctx: { params: Promise<{ tool: string }> }) {
  const { tool } = await ctx.params;

  const auth = await authenticateVoiceRequest(req);
  if (!auth.ok) return auth.response;
  const { sb, actorId } = auth;

  const body = await parseBody(req);
  if (body === null) return voiceError('BAD_REQUEST', '請求格式不是有效的 JSON', 400);

  if (tool === 'search_projects') return searchProjects(sb, body);
  if (tool === 'get_project_summary') return getProjectSummary(sb, body);
  if (tool === 'list_tasks') return listTasks(sb, body);
  if (tool === 'propose_write') return proposeWrite(sb, actorId, body);
  if (tool === 'create_task' || tool === 'log_note') return commitWrite(sb, actorId, tool, body);

  if (READ_TOOLS.has(tool) || WRITE_TOOLS.has(tool)) {
    // 不會走到這裡(above 已窮舉),保留給未來新增工具時的防呆
    return voiceError('BAD_REQUEST', `工具 ${tool} 尚未實作`, 400);
  }
  return voiceError('BAD_REQUEST', `未知的工具: ${tool}`, 404);
}
