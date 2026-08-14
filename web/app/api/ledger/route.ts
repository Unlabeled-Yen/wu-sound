import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';
import { validateLedger, type LedgerInput } from '@/lib/ledger-validation';
import { KIND_TO_JOURNAL, type LedgerDirection, type LedgerKind, type InvoiceStatus, type LedgerState } from '@/lib/types';

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
  const stateRaw = searchParams.get('state');
  const stateParam: LedgerState = stateRaw === 'voided' ? 'voided' : 'posted';
  const siteId = searchParams.get('site_id');

  const sb = getSupabaseAdmin();
  let q = sb.from('ledger_entries').select('*').eq('state', stateParam);

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
  if (siteId) q = q.eq('site_id', siteId);

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
    fee_twd: Number(body.fee_twd ?? 0),
    party: body.party ? String(body.party).trim() || null : null,
    memo: body.memo ? String(body.memo).trim() || null : null,
    is_external: Boolean(body.is_external),
    invoice_status: (body.invoice_status ?? 'none') as InvoiceStatus,
    invoice_no: body.invoice_no ? String(body.invoice_no).trim() || null : null,
    invoice_date: body.invoice_date ? String(body.invoice_date) : null,
    tax_amount_twd: Number(body.tax_amount_twd ?? 0),
    site_id: body.site_id ? String(body.site_id) : null,
    receivable_id: body.receivable_id ? String(body.receivable_id) : null,
    payment_method: body.payment_method ? (String(body.payment_method) as LedgerInput['payment_method']) : null,
  };

  const err = validateLedger(input);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  // journal 永遠由 kind 在伺服器端算,不信任前端送來的值——kind 與帳簿是一對一,
  // 沒有理由讓兩者在請求裡各自表述、之後又對不上。對不到的(理論上不會發生,
  // KIND_TO_JOURNAL 窮舉了所有 kind)就 loud 擋掉,不要用猜的塞一個帳簿進去。
  const journal = KIND_TO_JOURNAL[input.kind];
  if (!journal) {
    return NextResponse.json({ error: `類別「${input.kind}」對應不到帳簿,請回報` }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const ins = await sb
    .from('ledger_entries')
    .insert({
      occurred_on: input.occurred_on,
      direction: input.direction,
      kind: input.kind,
      amount_twd: input.amount_twd,
      fee_twd: input.fee_twd,
      party: input.party,
      memo: input.memo,
      is_external: input.is_external,
      invoice_status: input.invoice_status,
      invoice_no: input.invoice_no,
      invoice_date: input.invoice_date,
      tax_amount_twd: input.tax_amount_twd,
      site_id: input.site_id,
      receivable_id: input.receivable_id,
      payment_method: input.payment_method ?? null,
      journal,
      site_distribution: input.site_id ? { [input.site_id]: 100 } : null,
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
