import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { BundleLine, BundleTemplate } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface SP {
  include_inactive?: string;
}

export default async function BundlesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = (await searchParams) ?? {};
  const includeInactive = sp.include_inactive === '1';

  const sb = getSupabaseAdmin();
  let query = sb.from('bundle_templates').select('*');
  if (!includeInactive) query = query.eq('active', true);
  query = query.order('updated_at', { ascending: false });
  const { data, error } = await query;
  const bundles = (data ?? []) as BundleTemplate[];

  const ids = bundles.map((b) => b.id);
  const countByBundle = new Map<string, number>();
  if (ids.length > 0) {
    const lq = await sb.from('bundle_lines').select('bundle_id').in('bundle_id', ids);
    for (const r of ((lq.data ?? []) as Pick<BundleLine, 'bundle_id'>[])) {
      countByBundle.set(r.bundle_id, (countByBundle.get(r.bundle_id) ?? 0) + 1);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--nm-text-primary)' }}>
          標配套組
        </h1>
        <span className="text-[13px]" style={{ color: 'var(--nm-text-muted)' }}>
          共 {bundles.length} 組
        </span>
        <Link
          href={includeInactive ? '/boss/bundles' : '/boss/bundles?include_inactive=1'}
          className="text-[13px] underline underline-offset-2"
          style={{ color: 'var(--nm-text-muted)' }}
        >
          {includeInactive ? '隱藏已停用' : '顯示已停用'}
        </Link>
        <div className="ml-auto">
          <Link href="/boss/bundles/new" className="nm-btn-solid text-[13px]">
            ＋ 新增套組
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-xl nm-inset p-4 text-[13px]" style={{ color: 'var(--nm-danger)' }}>
          查詢失敗:{error.message}
        </div>
      )}

      {!error && bundles.length === 0 && (
        <div className="rounded-2xl nm-inset p-10 text-center">
          <div className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>
            還沒有任何套組
          </div>
        </div>
      )}

      {bundles.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {bundles.map((b) => {
            const count = countByBundle.get(b.id) ?? 0;
            return (
              <Link
                key={b.id}
                href={`/boss/bundles/${b.id}`}
                className={`rounded-2xl nm-raised p-4 nm-lift block${b.active ? '' : ' opacity-50'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-lg font-semibold truncate" style={{ color: 'var(--nm-text-primary)' }}>
                      {b.name}
                      {!b.active && <span className="nm-pill ml-2 text-[12px]">已停用</span>}
                    </div>
                    {b.applicable_to && (
                      <div className="text-[13px] mt-1" style={{ color: 'var(--nm-text-muted)' }}>
                        適用:{b.applicable_to}
                      </div>
                    )}
                  </div>
                  <span className="nm-pill shrink-0 text-[12px]">{count} 項</span>
                </div>
                {b.note && (
                  <div className="text-[12px] mt-2" style={{ color: 'var(--nm-text-faint)' }}>
                    {b.note}
                  </div>
                )}
                <div className="mt-3 text-[12px] underline" style={{ color: 'var(--nm-text-secondary)' }}>
                  編輯
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
