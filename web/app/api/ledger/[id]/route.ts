import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';
import { validateLedger, type LedgerInput } from '@/lib/ledger-validation';
import type { LedgerEntry, LedgerDirection, LedgerKind, InvoiceStatus } from '@/lib/types';

export const runtime = 'nodejs';

const BATCH_LOCKED_FIELDS: Array<keyof LedgerInput> = [
  'occurred_on', 'direction', 'kind', 'amount_twd', 'party', 'is_external',
];

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });
  if (session.role !== 'boss') return NextResponse.json({ error: '權限不足' }, { status: 403 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });

  let body: Partial<LedgerInput>;
  try {
    body = (await req.json()) as Partial<LedgerInput>;
  } catch {
    return NextResponse.json({ error: '無效的請求' }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const cur = await sb.from('ledger_entries').select('*').eq('id', id).maybeSingle();
  if (cur.error) return NextResponse.json({ error: `查詢失敗: ${cur.error.message}` }, { status: 500 });
  if (!cur.data) return NextResponse.json({ error: '找不到記錄' }, { status: 404 });
  const before = cur.data as LedgerEntry;

  if (before.source_batch_id) {
    for (const f of BATCH_LOCKED_FIELDS) {
      if (f in body && body[f] !== undefined && body[f] !== (before as unknown as Record<string, unknown>)[f]) {
        return NextResponse.json(
          { error: '自動匯入的紀錄不可改金額,只能補備註' },
          { status: 400 },
        );
      }
    }
  }

  const merged: LedgerInput = {
    occurred_on: (body.occurred_on ?? before.occurred_on) as string,
    direction: (body.direction ?? before.direction) as LedgerDirection,
    kind: (body.kind ?? before.kind) as LedgerKind,
    amount_twd: body.amount_twd !== undefined ? Number(body.amount_twd) : before.amount_twd,
    party: body.party !== undefined ? (body.party ? String(body.party).trim() || null : null) : before.party,
    memo: body.memo !== undefined ? (body.memo ? String(body.memo).trim() || null : null) : before.memo,
    is_external: body.is_external !== undefined ? Boolean(body.is_external) : before.is_external,
    invoice_status: (body.invoice_status ?? before.invoice_status) as InvoiceStatus,
    invoice_no: body.invoice_no !== undefined ? (body.invoice_no ? String(body.invoice_no).trim() || null : null) : before.invoice_no,
    invoice_date: body.invoice_date !== undefined ? (body.invoice_date || null) : before.invoice_date,
    tax_amount_twd: body.tax_amount_twd !== undefined ? Number(body.tax_amount_twd) : before.tax_amount_twd,
  };

  const err = validateLedger(merged);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const upd = await sb.from('ledger_entries').update({
    occurred_on: merged.occurred_on,
    direction: merged.direction,
    kind: merged.kind,
    amount_twd: merged.amount_twd,
    party: merged.party,
    memo: merged.memo,
    is_external: merged.is_external,
    invoice_status: merged.invoice_status,
    invoice_no: merged.invoice_no,
    invoice_date: merged.invoice_date,
    tax_amount_twd: merged.tax_amount_twd,
  }).eq('id', id).select('*').single();

  if (upd.error || !upd.data) {
    return NextResponse.json({ error: `更新失敗: ${upd.error?.message ?? 'unknown'}` }, { status: 500 });
  }

  await sb.from('audit_log').insert({
    actor_id: session.id,
    action: 'ledger.update',
    target_table: 'ledger_entries',
    target_id: id,
    diff: { before, after: upd.data },
  });

  return NextResponse.json({ row: upd.data });
}
