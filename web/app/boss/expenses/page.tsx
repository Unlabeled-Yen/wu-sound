import { getSupabaseAdmin, RECEIPTS_BUCKET } from '@/lib/supabase';
import { CATEGORY_LABEL, type ExpenseRecord } from '@/lib/types';
import RowActions from './RowActions';

export const dynamic = 'force-dynamic';

interface JoinedRow extends ExpenseRecord {
  user_name: string;
  site_name: string | null;
  thumb_url: string | null;
}

export default async function BossExpensesPage() {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('expenses')
    .select('*, users!inner(name), sites(name)')
    .eq('status', 'submitted')
    .order('captured_at', { ascending: false });
  if (error) throw new Error(`Supabase 查詢失敗: ${error.message}`);

  const rows = await Promise.all(
    ((data ?? []) as unknown[]).map(async (raw) => {
      const r = raw as ExpenseRecord & {
        users?: { name?: string };
        sites?: { name?: string } | null;
      };
      let thumb: string | null = null;
      if (r.receipt_url) {
        const { data: signed } = await sb.storage
          .from(RECEIPTS_BUCKET)
          .createSignedUrl(r.receipt_url, 600);
        thumb = signed?.signedUrl ?? null;
      }
      return {
        ...r,
        user_name: r.users?.name ?? '?',
        site_name: r.sites?.name ?? null,
        thumb_url: thumb,
      } as JoinedRow;
    }),
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">零用金審核 · 待確認 ({rows.length})</h1>

      {rows.length === 0 ? (
        <p className="text-neutral-500 mt-12">目前沒有待審核的項目</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-100 dark:bg-neutral-800 text-left">
              <tr>
                <th className="px-3 py-2">姓名</th>
                <th className="px-3 py-2">日期</th>
                <th className="px-3 py-2">分類</th>
                <th className="px-3 py-2">品項</th>
                <th className="px-3 py-2">案場</th>
                <th className="px-3 py-2 text-right">金額</th>
                <th className="px-3 py-2">收據</th>
                <th className="px-3 py-2">動作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-neutral-200 dark:border-neutral-800 align-top"
                >
                  <td className="px-3 py-2 font-medium">{r.user_name}</td>
                  <td className="px-3 py-2 tabular-nums">{r.spent_on ?? '—'}</td>
                  <td className="px-3 py-2">{r.category ? CATEGORY_LABEL[r.category] : '—'}</td>
                  <td className="px-3 py-2">{r.item_text ?? '—'}</td>
                  <td className="px-3 py-2">{r.site_name ?? '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">
                    {r.amount_twd != null ? `NT$ ${r.amount_twd.toLocaleString('zh-TW')}` : '—'}
                  </td>
                  <td className="px-3 py-2">
                    {r.thumb_url ? (
                      <a href={r.thumb_url} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={r.thumb_url}
                          alt="收據"
                          className="w-[100px] h-[100px] object-cover rounded-lg border border-neutral-200 dark:border-neutral-700"
                        />
                      </a>
                    ) : (
                      <span className="text-neutral-500">無收據</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <RowActions id={r.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
