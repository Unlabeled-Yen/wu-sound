'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';
import { validateLedger, type LedgerInput } from '@/lib/ledger-validation';
import type { LedgerEntry, LedgerDirection, LedgerKind, InvoiceStatus } from '@/lib/types';

interface Result { ok: boolean; error?: string }

async function assertBoss() {
  const session = await getSession();
  if (!session) return { session: null, err: '未登入' as string | null };
  if (session.role !== 'boss') return { session: null, err: '權限不足' as string | null };
  return { session, err: null };
}

function readFormLedger(fd: FormData): LedgerInput {
  const is_external = fd.get('is_external') === 'on' || fd.get('is_external') === 'true';
  const tax = Number(fd.get('tax_amount_twd') ?? 0);
  return {
    occurred_on: String(fd.get('occurred_on') ?? ''),
    direction: String(fd.get('direction') ?? '') as LedgerDirection,
    kind: String(fd.get('kind') ?? '') as LedgerKind,
    amount_twd: Number(fd.get('amount_twd') ?? 0),
    party: (String(fd.get('party') ?? '').trim() || null),
    memo: (String(fd.get('memo') ?? '').trim() || null),
    is_external,
    invoice_status: (String(fd.get('invoice_status') ?? 'none') as InvoiceStatus),
    invoice_no: (String(fd.get('invoice_no') ?? '').trim() || null),
    invoice_date: (String(fd.get('invoice_date') ?? '').trim() || null),
    tax_amount_twd: is_external ? (Number.isFinite(tax) ? tax : 0) : 0,
  };
}

export async function voidEntry(id: string, reason?: string): Promise<Result> {
  const { session, err } = await assertBoss();
  if (!session) return { ok: false, error: err ?? '未登入' };
  if (!id) return { ok: false, error: '缺少 id' };
  const r = (reason ?? '').trim();
  if (r.length < 2) return { ok: false, error: '請填寫作廢原因(至少 2 字)' };

  const sb = getSupabaseAdmin();
  const cur = await sb.from('ledger_entries').select('*').eq('id', id).maybeSingle();
  if (cur.error) return { ok: false, error: `查詢失敗: ${cur.error.message}` };
  if (!cur.data) return { ok: false, error: '找不到記錄' };
  if (cur.data.status === 'voided') return { ok: false, error: '此筆已作廢' };
  const upd = await sb
    .from('ledger_entries')
    .update({ status: 'voided', voided_reason: r })
    .eq('id', id)
    .select('*')
    .single();
  if (upd.error) return { ok: false, error: `作廢失敗: ${upd.error.message}` };

  await sb.from('audit_log').insert({
    actor_id: session.id,
    action: 'ledger.void',
    target_table: 'ledger_entries',
    target_id: id,
    diff: { before: cur.data, after: upd.data, reason: r },
  });

  revalidatePath('/boss/ledger');
  return { ok: true };
}

export async function voidEntryForm(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const reason = String(formData.get('reason') ?? '');
  await voidEntry(id, reason);
}

export async function createEntry(formData: FormData): Promise<Result> {
  const { session, err } = await assertBoss();
  if (!session) return { ok: false, error: err ?? '未登入' };

  const input = readFormLedger(formData);
  const v = validateLedger(input);
  if (v) return { ok: false, error: v };

  const sb = getSupabaseAdmin();
  const ins = await sb.from('ledger_entries').insert({
    ...input,
    created_by: session.id,
  }).select('*').single();
  if (ins.error || !ins.data) {
    return { ok: false, error: `新增失敗: ${ins.error?.message ?? 'unknown'}` };
  }

  await sb.from('audit_log').insert({
    actor_id: session.id,
    action: 'ledger.create',
    target_table: 'ledger_entries',
    target_id: ins.data.id,
    diff: { after: ins.data },
  });

  revalidatePath('/boss/ledger');
  const month = input.occurred_on.slice(0, 7);
  redirect(`/boss/ledger?month=${month}`);
}

const BATCH_LOCKED_FIELDS: Array<keyof LedgerInput> = [
  'occurred_on', 'direction', 'kind', 'amount_twd', 'party', 'is_external',
];

export async function updateEntry(id: string, formData: FormData): Promise<Result> {
  const { session, err } = await assertBoss();
  if (!session) return { ok: false, error: err ?? '未登入' };
  if (!id) return { ok: false, error: '缺少 id' };

  const sb = getSupabaseAdmin();
  const cur = await sb.from('ledger_entries').select('*').eq('id', id).maybeSingle();
  if (cur.error) return { ok: false, error: `查詢失敗: ${cur.error.message}` };
  if (!cur.data) return { ok: false, error: '找不到記錄' };
  const before = cur.data as LedgerEntry;

  const input = readFormLedger(formData);

  if (before.source_batch_id) {
    for (const f of BATCH_LOCKED_FIELDS) {
      const bv = (before as unknown as Record<string, unknown>)[f];
      const iv = (input as unknown as Record<string, unknown>)[f];
      if (bv !== iv) {
        return { ok: false, error: '自動匯入的紀錄不可改金額,只能補備註' };
      }
    }
  }

  const v = validateLedger(input);
  if (v) return { ok: false, error: v };

  const upd = await sb.from('ledger_entries').update({
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
  }).eq('id', id).select('*').single();
  if (upd.error || !upd.data) {
    return { ok: false, error: `更新失敗: ${upd.error?.message ?? 'unknown'}` };
  }

  await sb.from('audit_log').insert({
    actor_id: session.id,
    action: 'ledger.update',
    target_table: 'ledger_entries',
    target_id: id,
    diff: { before, after: upd.data },
  });

  revalidatePath('/boss/ledger');
  const month = input.occurred_on.slice(0, 7);
  redirect(`/boss/ledger?month=${month}`);
}

interface ImportResult { ok: boolean; created?: number; skipped?: number; error?: string }

export async function importBatch(batch_id: string): Promise<ImportResult> {
  const { session, err } = await assertBoss();
  if (!session) return { ok: false, error: err ?? '未登入' };
  if (!batch_id) return { ok: false, error: '缺少 batch_id' };

  const sb = getSupabaseAdmin();
  const batch = await sb.from('book_batches').select('*').eq('id', batch_id).maybeSingle();
  if (batch.error) return { ok: false, error: `查詢失敗: ${batch.error.message}` };
  if (!batch.data) return { ok: false, error: '薪資結算尚未鎖定' };

  const monthStr = String(batch.data.month).slice(0, 10);
  const [y, m] = monthStr.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const occurred_on = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const monthLabel = `${m}月`;

  const conf = await sb
    .from('expenses')
    .select('user_id, amount_twd, users!inner(name)')
    .eq('booked_batch_id', batch_id);
  if (conf.error) return { ok: false, error: `查詢失敗: ${conf.error.message}` };

  const rows = (conf.data ?? []) as unknown as Array<{ amount_twd: number | null; users?: { name?: string } | null }>;
  const totals = new Map<string, number>();
  for (const r of rows) {
    const name = r.users?.name ?? '?';
    totals.set(name, (totals.get(name) ?? 0) + (r.amount_twd ?? 0));
  }

  let created = 0;
  let skipped = 0;
  for (const [party, sum] of totals) {
    if (sum <= 0) { skipped += 1; continue; }
    const ins = await sb.from('ledger_entries').insert({
      occurred_on, direction: 'expense', kind: 'reimbursement',
      amount_twd: sum, party, memo: `${monthLabel}零用金薪資結算`,
      is_external: false, invoice_status: 'none', tax_amount_twd: 0,
      source_batch_id: batch_id, created_by: session.id,
    }).select('id').single();
    if (ins.error) {
      if (/duplicate|unique/i.test(ins.error.message)) { skipped += 1; continue; }
      return { ok: false, error: `匯入失敗(${party}): ${ins.error.message}`, created, skipped };
    }
    created += 1;
    await sb.from('audit_log').insert({
      actor_id: session.id,
      action: 'ledger.import_batch',
      target_table: 'ledger_entries',
      target_id: ins.data.id,
      diff: { batch_id, party, amount_twd: sum },
    });
  }

  revalidatePath('/boss/ledger');
  return { ok: true, created, skipped };
}
