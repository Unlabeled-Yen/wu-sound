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
    <div className="max-w-lg mx-auto px-4 py-5">
      <h1 className="text-xl font-semibold mb-4">
        待確認 <span className="text-neutral-500 text-base">({rows.length})</span>
      </h1>

      {rows.length === 0 ? (
        <p className="text-center text-sm text-neutral-500 mt-16">目前沒有待確認項目</p>
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
                  className="flex gap-3 p-3 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 active:scale-[0.99]"
                >
                  <div className="w-20 h-20 rounded-xl bg-neutral-100 dark:bg-neutral-800 overflow-hidden flex items-center justify-center text-xs text-neutral-500 shrink-0">
                    {url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt="收據縮圖" className="w-full h-full object-cover" />
                    ) : (
                      '無收據'
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-neutral-500">
                        {new Date(r.captured_at).toLocaleDateString('zh-TW')}
                      </span>
                      {stale ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-300">
                          已放置 {ageDays} 天
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-base">
                      {shownCat ? CATEGORY_LABEL[shownCat] : '未分類'}
                      {r.item_text ? ` · ${r.item_text}` : ''}
                    </div>
                    <div className="mt-1 text-lg font-semibold tabular-nums">
                      {shownAmt != null ? (
                        <>
                          NT$ {shownAmt.toLocaleString('zh-TW')}
                          {r.amount_twd == null && aiAmt != null ? (
                            <span className="ml-2 text-xs font-normal text-amber-600 border border-amber-400 rounded px-1.5 py-0.5">
                              AI 建議 · 待確認
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-red-600 text-sm font-medium">請手動填寫金額</span>
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
