import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';
import { validateLedger, type LedgerInput } from '@/lib/ledger-validation';
import type { LedgerDirection, LedgerKind, InvoiceStatus, LedgerStatus } from '@/lib/types';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });
  if (session.role !== 'boss') return NextResponse.json({ error: '權限不足' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const month = searchParams.get('month');
  const direction = searchParams.get('direction') as LedgerDirection | null;
  const kind = searchParams.get('kind') as LedgerKind | null;
  const isExtRaw = searchParams.get('is_external');
  const statusParam = (searchParams.get('status') as LedgerStatus | null) ?? 'active';

  const sb = getSupabaseAdmin();
  let q = sb.from('ledger_entries').select('*').eq('status', statusParam);

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const from = `${month}-01`;
    const [y, m] = month.split('-').map(Number);
    const nextY = m === 12 ? y + 1 : y;
    const nextM = m === 12 ? 1 : m + 1;
    const to = `${nextY}-${String(nextM).padStart(2, '0')}-01`;
    q = q.gte('occurred_on', from).lt('occurred_on', to);
  }
  if (direction === 'income' || direction === 'expense') q = q.eq('direction', direction);
  if (kind) q = q.eq('kind', kind);
  if (isExtRaw === 'true') q = q.eq('is_external', true);
  else if (isExtRaw === 'false') q = q.eq('is_external', false);

  q = q.order('occurred_on', { ascending: true }).order('created_at', { ascending: true });

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: `查詢失敗: ${error.message}` }, { status: 500 });
  return NextResponse.json({ rows: data ?? [] });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });
  if (session.role !== 'boss') return NextResponse.json({ error: '權限不足' }, { status: 403 });

  let body: Partial<LedgerInput>;
  try {
    body = (await req.json()) as Partial<LedgerInput>;
  } catch {
    return NextResponse.json({ error: '無效的請求' }, { status: 400 });
  }

  const input: LedgerInput = {
    occurred_on: String(body.occurred_on ?? ''),
    direction: body.direction as LedgerDirection,
    kind: body.kind as LedgerKind,
    amount_twd: Number(body.amount_twd),
    party: body.party ? String(body.party).trim() || null : null,
    memo: body.memo ? String(body.memo).trim() || null : null,
    is_external: Boolean(body.is_external),
    invoice_status: (body.invoice_status ?? 'none') as InvoiceStatus,
    invoice_no: body.invoice_no ? String(body.invoice_no).trim() || null : null,
    invoice_date: body.invoice_date ? String(body.invoice_date) : null,
    tax_amount_twd: Number(body.tax_amount_twd ?? 0),
  };

  const err = validateLedger(input);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const sb = getSupabaseAdmin();
  const ins = await sb
    .from('ledger_entries')
    .insert({
      occurred_on: input.occurred_on,
      direction: input.direction,
      kind: input.kind,
      amount_twd: input.amount_twd,
      party: input.party,
      memo: input.memo,
      is_external: input.is_external,
      invoice_status: input.invoice_status,
      invoice_no: input.invoice_no,
      invoice_date: input.invoice_date,
      tax_amount_twd: input.tax_amount_twd,
      created_by: session.id,
    })
    .select('*')
    .single();

  if (ins.error || !ins.data) {
    return NextResponse.json({ error: `新增失敗: ${ins.error?.message ?? 'unknown'}` }, { status: 500 });
  }

  await sb.from('audit_log').insert({
    actor_id: session.id,
    action: 'ledger.create',
    target_table: 'ledger_entries',
    target_id: ins.data.id,
    diff: { after: ins.data },
  });

  return NextResponse.json({ row: ins.data });
}
