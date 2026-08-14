import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

interface ExpenseWithUser {
  user_id: string;
  amount_twd: number | null;
  users?: { name?: string } | null;
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });
  if (session.role !== 'boss') return NextResponse.json({ error: '權限不足' }, { status: 403 });

  let body: { batch_id?: string };
  try {
    body = (await req.json()) as { batch_id?: string };
  } catch {
    return NextResponse.json({ error: '無效的請求' }, { status: 400 });
  }
  const batch_id = body.batch_id;
  if (!batch_id || typeof batch_id !== 'string') {
    return NextResponse.json({ error: '缺少 batch_id' }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const batch = await sb.from('book_batches').select('*').eq('id', batch_id).maybeSingle();
  if (batch.error) return NextResponse.json({ error: `查詢失敗: ${batch.error.message}` }, { status: 500 });
  if (!batch.data) return NextResponse.json({ error: '薪資結算尚未鎖定' }, { status: 400 });

  // book_batches.month 為該月第一天;採用當月最後一天作為 occurred_on
  const monthStr = String(batch.data.month).slice(0, 10); // YYYY-MM-01
  const [y, m] = monthStr.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const occurred_on = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const monthLabel = `${m}月`;

  const conf = await sb
    .from('expenses')
    .select('user_id, amount_twd, users!inner(name)')
    .eq('booked_batch_id', batch_id);
  if (conf.error) return NextResponse.json({ error: `查詢失敗: ${conf.error.message}` }, { status: 500 });

  const rows = (conf.data ?? []) as unknown as ExpenseWithUser[];
  const totals = new Map<string, number>();
  for (const r of rows) {
    const name = r.users?.name ?? '?';
    totals.set(name, (totals.get(name) ?? 0) + (r.amount_twd ?? 0));
  }

  let created = 0;
  let skipped = 0;

  for (const [party, sum] of totals) {
    if (sum <= 0) { skipped += 1; continue; }
    const ins = await sb
      .from('ledger_entries')
      .insert({
        occurred_on,
        direction: 'expense',
        kind: 'reimbursement',
        journal: 'pettycash',
        amount_twd: sum,
        party,
        memo: `${monthLabel}零用金薪資結算`,
        is_external: false,
        invoice_status: 'none',
        tax_amount_twd: 0,
        source_batch_id: batch_id,
        created_by: session.id,
      })
      .select('id')
      .single();

    if (ins.error) {
      if (/duplicate|unique/i.test(ins.error.message)) {
        skipped += 1;
        continue;
      }
      return NextResponse.json(
        { error: `匯入失敗(${party}): ${ins.error.message}`, created, skipped },
        { status: 500 },
      );
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

  return NextResponse.json({ created, skipped, batch_id });
}
