import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin, RECEIPTS_BUCKET } from '@/lib/supabase';
import { CATEGORY_LABEL, type ExpenseRecord } from '@/lib/types';

export const dynamic = 'force-dynamic';

async function signedUrl(path: string): Promise<string | null> {
  const sb = getSupabaseAdmin();
  const { data } = await sb.storage.from(RECEIPTS_BUCKET).createSignedUrl(path, 300);
  return data?.signedUrl ?? null;
}

export default async function StaffQueuePage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('expenses')
    .select('*')
    .eq('user_id', session.id)
    .eq('status', 'draft')
    .order('captured_at', { ascending: false });
  if (error) {
    throw new Error(`Supabase 查詢草稿失敗: ${error.message}`);
  }
  const rows = (data ?? []) as ExpenseRecord[];

  const now = Date.now();
  const items = await Promise.all(
    rows.map(async (r) => {
      const url = r.receipt_url ? await signedUrl(r.receipt_url) : null;
      const ageMs = now - new Date(r.captured_at).getTime();
      const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
      const stale = ageMs > 72 * 60 * 60 * 1000;
      return { r, url, ageDays, stale };
    }),
  );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold" style={{ color: 'var(--nm-text-primary)' }}>
        待確認 <span className="text-base font-normal" style={{ color: 'var(--nm-text-muted)' }}>({rows.length})</span>
      </h1>

      {rows.length === 0 ? (
        <p className="text-center text-[13px] mt-16" style={{ color: 'var(--nm-text-muted)' }}>目前沒有待確認項目</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map(({ r, url, ageDays, stale }) => {
            const aiAmt = r.ai_draft?.amount_twd;
            const aiCat = r.ai_draft?.category;
            const shownAmt = r.amount_twd ?? aiAmt;
            const shownCat = r.category ?? aiCat;
            return (
              <li key={r.id}>
                <Link
                  href={`/staff/queue/${r.id}`}
                  className="flex gap-3 p-3 rounded-2xl nm-raised active:scale-[0.99] transition"
                >
                  <div className="w-20 h-20 rounded-xl nm-inset overflow-hidden flex items-center justify-center text-xs shrink-0" style={{ color: 'var(--nm-text-muted)' }}>
                    {url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt="收據縮圖" className="w-full h-full object-cover" />
                    ) : (
                      '無收據'
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm" style={{ color: 'var(--nm-text-muted)' }}>
                        {new Date(r.captured_at).toLocaleDateString('zh-TW')}
                      </span>
                      {stale ? (
                        <span className="nm-pill nm-pill-danger">
                          已放置 {ageDays} 天
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-base" style={{ color: 'var(--nm-text-body)' }}>
                      {shownCat ? CATEGORY_LABEL[shownCat] : '未分類'}
                      {r.item_text ? ` · ${r.item_text}` : ''}
                    </div>
                    <div className="mt-1 text-lg font-semibold tabular" style={{ color: 'var(--nm-text-primary)' }}>
                      {shownAmt != null ? (
                        <>
                          ${shownAmt.toLocaleString('zh-TW')}
                          {r.amount_twd == null && aiAmt != null ? (
                            <span className="ml-2 nm-pill nm-pill-warning">
                              AI 建議 · 待確認
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-sm font-medium" style={{ color: 'var(--nm-danger)' }}>請手動填寫金額</span>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
