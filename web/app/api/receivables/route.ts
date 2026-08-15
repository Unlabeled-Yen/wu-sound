import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';
import { validateReceivable, type ReceivableInput } from '@/lib/receivable-validation';
import { fetchReceivablesWithRemaining } from '@/lib/receivables-query';
import type { ReceivableDirection, ReceivableStatus } from '@/lib/types';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });
  if (session.role !== 'boss') return NextResponse.json({ error: '權限不足' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = (searchParams.get('status') as ReceivableStatus | null) ?? undefined;
  const direction = (searchParams.get('direction') as ReceivableDirection | null) ?? undefined;

  const sb = getSupabaseAdmin();
  const { rows, error } = await fetchReceivablesWithRemaining(sb, { status, direction });
  if (error) return NextResponse.json({ error: `查詢失敗: ${error}` }, { status: 500 });

  return NextResponse.json({ rows });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });
  if (session.role !== 'boss') return NextResponse.json({ error: '權限不足' }, { status: 403 });

  let body: Partial<ReceivableInput>;
  try {
    body = (await req.json()) as Partial<ReceivableInput>;
  } catch {
    return NextResponse.json({ error: '無效的請求' }, { status: 400 });
  }

  const input: ReceivableInput = {
    direction: body.direction as ReceivableDirection,
    party: String(body.party ?? '').trim(),
    site_id: body.site_id ? String(body.site_id) : null,
    total_amount_twd: Number(body.total_amount_twd),
    memo: body.memo ? String(body.memo).trim() || null : null,
    agreed_due_date: body.agreed_due_date ? String(body.agreed_due_date) : null,
  };

  const err = validateReceivable(input);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const sb = getSupabaseAdmin();
  const ins = await sb
    .from('receivables')
    .insert({
      direction: input.direction,
      party: input.party,
      site_id: input.site_id,
      total_amount_twd: input.total_amount_twd,
      memo: input.memo,
      agreed_due_date: input.agreed_due_date,
      created_by: session.id,
    })
    .select('*')
    .single();

  if (ins.error || !ins.data) {
    return NextResponse.json({ error: `新增失敗: ${ins.error?.message ?? 'unknown'}` }, { status: 500 });
  }

  await sb.from('audit_log').insert({
    actor_id: session.id,
    action: 'receivable.create',
    target_table: 'receivables',
    target_id: ins.data.id,
    diff: { after: ins.data },
  });

  return NextResponse.json({ row: ins.data });
}
