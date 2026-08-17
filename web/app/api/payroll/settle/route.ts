import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getOrCreatePayrollBatch, syncPayrollMonth } from '@/lib/payroll-sync-server';

export const runtime = 'nodejs';

const MONTH_RE = /^\d{4}-\d{2}$/;

// 月結中心的「送出結算」——第一次按=建立這個月的處理中心並寫入分錄,
// 之後每次按(或改獎金/月薪/代墊觸發自動同步)=重新比對、更新差異。
// 不存在「已鎖定不能改」這回事:薪資本質上就是一般支出分錄,改了就同步。
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });
  if (session.role !== 'boss') return NextResponse.json({ error: '權限不足' }, { status: 403 });

  let body: { month?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求' }, { status: 400 });
  }
  const month = typeof body.month === 'string' ? body.month : '';
  if (!MONTH_RE.test(month)) return NextResponse.json({ error: '月份格式錯誤' }, { status: 400 });

  const sb = getSupabaseAdmin();

  const batch = await getOrCreatePayrollBatch(sb, month, session.id);
  if ('error' in batch) return NextResponse.json({ error: batch.error }, { status: 500 });

  const result = await syncPayrollMonth(sb, batch.batchId, month, session.id);
  if (!result.ok) return NextResponse.json({ error: result.error, batch_id: batch.batchId }, { status: 500 });

  return NextResponse.json({
    ok: true,
    batch_id: result.batchId,
    inserted: result.inserted,
    updated: result.updated,
    voided: result.voided,
    skipped_no_profile: result.skippedNoProfile,
  });
}
