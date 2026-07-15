import { getSupabaseAdmin, RECEIPTS_BUCKET } from '@/lib/supabase';
import { CATEGORY_LABEL, type ExpenseRecord } from '@/lib/types';
import RowActions from './RowActions';
import ExpenseCardMobile from './ExpenseCardMobile';

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

  // 員工手機裡還沒送出的 draft(拍了照沒填內容)——boss 看得到才知道要催誰
  const { data: draftData } = await sb
    .from('expenses')
    .select('id, user_id, captured_at, receipt_url, amount_twd, users!inner(name)')
    .eq('status', 'draft')
    .order('captured_at', { ascending: false });
  const drafts = (draftData ?? []) as unknown as (ExpenseRecord & { users?: { name?: string } })[];
  const draftsByUser = new Map<string, { name: string; count: number; latest: string }>();
  for (const d of drafts) {
    const cur = draftsByUser.get(d.user_id) ?? { name: d.users?.name ?? '?', count: 0, latest: '' };
    cur.count += 1;
    if (!cur.latest || d.captured_at > cur.latest) cur.latest = d.captured_at;
    draftsByUser.set(d.user_id, cur);
  }
  const draftGroups = Array.from(draftsByUser.entries()).sort(([, a], [, b]) => b.count - a.count);

  // Batch-sign all receipt URLs in ONE request (was N+1 calls per receipt).
  const raws = (data ?? []) as (ExpenseRecord & {
    users?: { name?: string };
    sites?: { name?: string } | null;
  })[];
  const receiptPaths = raws.map((r) => r.receipt_url).filter((p): p is string => !!p);
  const signedByPath = new Map<string, string>();
  if (receiptPaths.length > 0) {
    const { data: signed } = await sb.storage
      .from(RECEIPTS_BUCKET)
      .createSignedUrls(receiptPaths, 600);
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) signedByPath.set(s.path, s.signedUrl);
    }
  }
  const rows: JoinedRow[] = raws.map((r) => ({
    ...r,
    user_name: r.users?.name ?? '?',
    site_name: r.sites?.name ?? null,
    thumb_url: r.receipt_url ? (signedByPath.get(r.receipt_url) ?? null) : null,
  }));

  const draftReminderSub =
    draftGroups.length === 1
      ? `${draftGroups[0][1].name}拍了照還沒填金額,需提醒去 App 完成`
      : `員工拍了照還沒填金額,需提醒去 App 完成`;

  return (
    <div className="space-y-4">
      {/* Mobile view */}
      <div className="lg:hidden flex flex-col gap-4">
        {drafts.length > 0 && (
          <div
            className="rounded-2xl px-4 py-3.5"
            style={{
              background: 'rgba(217,181,107,0.09)',
              border: '1px solid rgba(217,181,107,0.3)',
              textShadow: '0 1px 2px rgba(0,0,0,0.5)',
            }}
          >
            <div className="text-[13px] font-semibold mb-1" style={{ color: 'var(--nm-warning-glass-text)' }}>
              員工草稿 · {drafts.length} 筆
            </div>
            <div className="text-[12px] leading-relaxed" style={{ color: '#b8ac8e' }}>
              {draftReminderSub}
            </div>
          </div>
        )}

        {rows.length === 0 ? (
          <p className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>
            目前沒有待審核的項目(員工還沒送出)
          </p>
        ) : (
          rows.map((r) => (
            <ExpenseCardMobile
              key={r.id}
              row={{
                id: r.id,
                user_name: r.user_name,
                amount_twd: r.amount_twd ?? null,
                spent_on: r.spent_on ?? null,
                category_label: r.category ? CATEGORY_LABEL[r.category] : '—',
                site_name: r.site_name,
                item_text: r.item_text ?? null,
                thumb_url: r.thumb_url,
              }}
            />
          ))
        )}
      </div>

      {/* Desktop view (unchanged) */}
      <div className="hidden lg:block space-y-4">
      <h1 className="text-2xl font-semibold" style={{ color: 'var(--nm-text-primary)' }}>
        零用金管理 · 待確認 ({rows.length})
      </h1>

      {drafts.length > 0 && (
        <section
          className="rounded-2xl nm-raised p-4"
          style={{ color: 'var(--nm-text-primary)' }}
        >
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--nm-warning)' }}>
              員工草稿 · {drafts.length} 筆
            </h2>
            <span className="text-[11px]" style={{ color: 'var(--nm-text-muted)' }}>
              員工拍了照但還沒填金額/送出——需要提醒員工去 App 完成
            </span>
          </div>
          <ul className="space-y-1">
            {draftGroups.map(([uid, g]) => (
              <li
                key={uid}
                className="flex items-center justify-between rounded-lg nm-inset-sm px-3 py-2 text-xs"
              >
                <span>
                  <span style={{ color: 'var(--nm-text-primary)' }}>{g.name}</span>
                  <span className="ml-2" style={{ color: 'var(--nm-text-muted)' }}>
                    最近一筆 {g.latest.slice(0, 10)}
                  </span>
                </span>
                <span style={{ color: 'var(--nm-warning)' }}>{g.count} 筆</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {rows.length === 0 ? (
        <p className="mt-4" style={{ color: 'var(--nm-text-secondary)' }}>
          目前沒有待審核的項目(員工還沒送出)
        </p>
      ) : (
        <div className="rounded-2xl nm-raised overflow-x-auto overflow-y-auto">
          <table className="w-full text-[13px]" style={{ minWidth: 900, borderCollapse: 'collapse' }}>
            <thead style={{ background: 'rgba(20,20,24,0.92)' }}>
              <tr className="text-left" style={{ color: 'var(--nm-text-muted)' }}>
                <th className="px-3 py-2 font-normal whitespace-nowrap">姓名</th>
                <th className="px-3 py-2 font-normal whitespace-nowrap">日期</th>
                <th className="px-3 py-2 font-normal whitespace-nowrap">分類</th>
                <th className="px-3 py-2 font-normal whitespace-nowrap">品項</th>
                <th className="px-3 py-2 font-normal whitespace-nowrap">專案</th>
                <th className="px-3 py-2 text-right font-normal whitespace-nowrap">金額</th>
                <th className="px-3 py-2 font-normal whitespace-nowrap">收據</th>
                <th className="px-3 py-2 font-normal whitespace-nowrap">動作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="align-top"
                  style={{ borderTop: '1px solid var(--nm-border-hair)' }}
                >
                  <td className="px-3 py-2 font-medium whitespace-nowrap" style={{ color: 'var(--nm-text-body)' }}>{r.user_name}</td>
                  <td className="px-3 py-2 tabular whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>{r.spent_on ?? '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>{r.category ? CATEGORY_LABEL[r.category] : '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>{r.item_text ?? '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>{r.site_name ?? '—'}</td>
                  <td className="px-3 py-2 text-right tabular font-semibold whitespace-nowrap" style={{ color: 'var(--nm-text-body)' }}>
                    {r.amount_twd != null ? `NT$ ${r.amount_twd.toLocaleString('zh-TW')}` : '—'}
                  </td>
                  <td className="px-3 py-2">
                    {r.thumb_url ? (
                      <a href={r.thumb_url} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={r.thumb_url}
                          alt="收據"
                          className="w-[100px] h-[100px] object-cover rounded-lg"
                          style={{ border: '1px solid var(--nm-border-glass)' }}
                        />
                      </a>
                    ) : (
                      <span className="whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>無收據</span>
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
    </div>
  );
}
