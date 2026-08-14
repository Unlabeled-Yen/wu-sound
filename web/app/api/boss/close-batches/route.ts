import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });
  if (session.role !== 'boss') return NextResponse.json({ error: '權限不足' }, { status: 403 });

  const sb = getSupabaseAdmin();
  const { data: batches, error } = await sb
    .from('book_batches')
    .select('id, month')
    .order('month', { ascending: false });
  if (error) return NextResponse.json({ error: `查詢失敗: ${error.message}` }, { status: 500 });

  const ids = (batches ?? []).map((b) => b.id as string);
  const set = new Set<string>();
  if (ids.length > 0) {
    // 已作廢的入帳分錄不算「已入帳」——否則作廢後這批會被永久標記為已處理,
    // 既無法在畫面上看出需要重新匯入,ledger_batch_party_uidx 也已改成排除
    // voided 列(見 migrations/017),資料庫層面本來就允許重新匯入。
    const { data: existing, error: e2 } = await sb
      .from('ledger_entries')
      .select('source_batch_id')
      .in('source_batch_id', ids)
      .neq('state', 'voided');
    if (e2) return NextResponse.json({ error: `查詢失敗: ${e2.message}` }, { status: 500 });
    for (const r of existing ?? []) {
      if (r.source_batch_id) set.add(r.source_batch_id as string);
    }
  }

  const rows = (batches ?? []).map((b) => ({
    id: b.id as string,
    month: String(b.month).slice(0, 10),
    has_reimbursement_entries: set.has(b.id as string),
  }));
  return NextResponse.json({ rows });
}
