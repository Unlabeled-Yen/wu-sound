import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { ReceivableStatus } from '@/lib/types';

export const runtime = 'nodejs';

const VALID: ReceivableStatus[] = ['open', 'closed', 'voided'];

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });
  if (session.role !== 'boss') return NextResponse.json({ error: '權限不足' }, { status: 403 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });

  let body: { status?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求' }, { status: 400 });
  }
  const status = body.status as ReceivableStatus;
  if (!VALID.includes(status)) return NextResponse.json({ error: '狀態錯誤' }, { status: 400 });

  const sb = getSupabaseAdmin();
  const cur = await sb.from('receivables').select('*').eq('id', id).maybeSingle();
  if (cur.error) return NextResponse.json({ error: `查詢失敗: ${cur.error.message}` }, { status: 500 });
  if (!cur.data) return NextResponse.json({ error: '找不到記錄' }, { status: 404 });

  if (status === 'voided') {
    const linked = await sb
      .from('ledger_entries')
      .select('id', { count: 'exact', head: true })
      .eq('receivable_id', id)
      .eq('status', 'active');
    if (linked.error) return NextResponse.json({ error: `查詢失敗: ${linked.error.message}` }, { status: 500 });
    if ((linked.count ?? 0) > 0) {
      return NextResponse.json({ error: `已有 ${linked.count} 筆帳目掛在此約定,不能作廢;請先把帳目改掛別處` }, { status: 400 });
    }
  }

  const upd = await sb.from('receivables').update({ status }).eq('id', id).select('*').single();
  if (upd.error || !upd.data) {
    return NextResponse.json({ error: `更新失敗: ${upd.error?.message ?? 'unknown'}` }, { status: 500 });
  }

  await sb.from('audit_log').insert({
    actor_id: session.id,
    action: 'receivable.status',
    target_table: 'receivables',
    target_id: id,
    diff: { before: cur.data.status, after: status },
  });

  return NextResponse.json({ row: upd.data });
}
