import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';
import { validateTaskMove } from '@/lib/task-validation';
import { TASK_STATUS_ORDER, type TaskStatus } from '@/lib/types';

export const runtime = 'nodejs';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });
  const { id } = await params;
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求內容' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const cur = await supabase.from('tasks').select('status, stuck_since').eq('id', id).maybeSingle();
  if (cur.error) return NextResponse.json({ error: `查詢失敗: ${cur.error.message}` }, { status: 500 });
  if (!cur.data) return NextResponse.json({ error: '找不到任務' }, { status: 404 });

  const patch: Record<string, unknown> = {};

  if (body.status !== undefined) {
    const toStatus = String(body.status) as TaskStatus;
    if (!TASK_STATUS_ORDER.includes(toStatus)) {
      return NextResponse.json({ error: '不合法的狀態' }, { status: 400 });
    }
    const waitingReason = body.waiting_reason != null ? String(body.waiting_reason).trim() : null;
    const err = validateTaskMove({ to_status: toStatus, waiting_reason: waitingReason });
    if (err) return NextResponse.json({ error: err }, { status: 400 });

    patch.status = toStatus;
    patch.waiting_reason = toStatus === 'blocked' ? waitingReason : null;
    // stuck_since:移入 blocked 時起算,移出時清空,重複停在 blocked 不重算起點。
    if (toStatus === 'blocked' && cur.data.status !== 'blocked') {
      patch.stuck_since = new Date().toISOString();
    } else if (toStatus !== 'blocked') {
      patch.stuck_since = null;
    }
  }

  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags) || !body.tags.every((t) => typeof t === 'string')) {
      return NextResponse.json({ error: '標籤格式錯誤' }, { status: 400 });
    }
    patch.tags = body.tags;
  }

  if (body.checklist !== undefined) {
    if (
      !Array.isArray(body.checklist) ||
      !body.checklist.every((c) => c && typeof c === 'object' && typeof (c as { label?: unknown }).label === 'string' && typeof (c as { done?: unknown }).done === 'boolean')
    ) {
      return NextResponse.json({ error: '子項清單格式錯誤' }, { status: 400 });
    }
    patch.checklist = body.checklist;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: '沒有要更新的欄位' }, { status: 400 });
  }

  const upd = await supabase.from('tasks').update(patch).eq('id', id);
  if (upd.error) return NextResponse.json({ error: `更新失敗: ${upd.error.message}` }, { status: 500 });

  return NextResponse.json({ ok: true });
}
