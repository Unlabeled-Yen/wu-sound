import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { SiteCategory } from '@/lib/types';
import { createSite, renameSite, setSiteActive, updateSiteMeta, createSiteCategory } from './actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Row {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
  category_id: string | null;
  customer_name: string | null;
  in_use: number;
}

export default async function BossSitesPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'boss') redirect('/staff');

  const sb = getSupabaseAdmin();
  const [{ data: sitesData, error }, { data: eqRefs }, { data: categoriesData }] = await Promise.all([
    sb.from('sites').select('id, name, active, created_at, category_id, customer_name').order('active', { ascending: false }).order('name'),
    sb.from('equipment').select('current_site_id').eq('status', 'on_site'),
    sb.from('site_categories').select('id, name, active').eq('active', true).order('name'),
  ]);

  const categories = (categoriesData ?? []) as SiteCategory[];

  const refCount = new Map<string, number>();
  for (const r of (eqRefs || []) as { current_site_id: string | null }[]) {
    if (r.current_site_id) refCount.set(r.current_site_id, (refCount.get(r.current_site_id) || 0) + 1);
  }
  const sites: Row[] = (sitesData || []).map((s) => ({
    ...(s as Omit<Row, 'in_use'>),
    in_use: refCount.get((s as { id: string }).id) ?? 0,
  }));

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold" style={{ color: 'var(--nm-text-primary)' }}>專案管理</h1>
        <p className="text-[13px] mt-0.5" style={{ color: 'var(--nm-text-secondary)' }}>共 {sites.length} 個專案。停用後不會出現在新的下拉選單,但歷史紀錄保留。一案一性質:同客戶既有安裝又辦活動,請開兩個案子。</p>
      </div>

      {error ? (
        <div
          className="rounded-xl p-3 text-[13px] mb-4"
          style={{
            background: 'rgba(224, 122, 122, 0.08)',
            border: '1px solid rgba(224, 122, 122, 0.34)',
            color: 'var(--nm-danger-glass-text)',
          }}
        >
          讀取失敗:{error.message}
        </div>
      ) : null}

      <div className="rounded-2xl nm-raised-sm p-3 mb-6 max-w-lg">
        <div className="text-[13px] mb-2" style={{ color: 'var(--nm-text-secondary)' }}>案件類別(用你自己的說法定義,如:固定安裝工程、活動、維修保養)</div>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {categories.length === 0 ? (
            <span className="text-[13px]" style={{ color: 'var(--nm-text-faint)' }}>還沒有類別</span>
          ) : (
            categories.map((c) => <span key={c.id} className="nm-pill nm-pill-neutral">{c.name}</span>)
          )}
        </div>
        <form action={createSiteCategory} className="flex gap-2 items-center">
          <input name="name" required placeholder="新增類別名稱" className="flex-1 nm-input text-[13px]" />
          <button type="submit" className="nm-btn text-[13px]">新增類別</button>
        </form>
      </div>

      <form action={createSite} className="flex gap-2 items-center mb-6 max-w-lg flex-wrap">
        <input
          name="name"
          required
          placeholder="新增專案名稱"
          className="flex-1 nm-input text-[13px]"
          style={{ minWidth: 160 }}
        />
        <select name="category_id" className="nm-input text-[13px]" style={{ width: 'auto' }}>
          <option value="">類別:未設</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input
          name="customer_name"
          placeholder="客戶(選填)"
          className="nm-input text-[13px]"
          style={{ width: 140 }}
        />
        <button
          type="submit"
          className="nm-btn-solid text-[13px]"
        >
          新增
        </button>
      </form>

      <div className="rounded-2xl nm-raised overflow-x-auto overflow-y-auto">
        <table className="w-full text-[13px]" style={{ minWidth: 780, borderCollapse: 'collapse' }}>
          <thead style={{ background: 'rgba(20,20,24,0.92)' }}>
            <tr style={{ color: 'var(--nm-text-muted)' }}>
              <th className="text-left py-2.5 px-3.5 font-normal text-[11px] leading-none tracking-[.14em] whitespace-nowrap">名稱</th>
              <th className="text-left py-2.5 px-3.5 font-normal text-[11px] leading-none tracking-[.14em] whitespace-nowrap">類別</th>
              <th className="text-left py-2.5 px-3.5 font-normal text-[11px] leading-none tracking-[.14em] whitespace-nowrap">客戶</th>
              <th className="text-left py-2.5 px-3.5 font-normal text-[11px] leading-none tracking-[.14em] whitespace-nowrap">狀態</th>
              <th className="text-left py-2.5 px-3.5 font-normal text-[11px] leading-none tracking-[.14em] whitespace-nowrap">目前在場設備</th>
              <th className="text-left py-2.5 px-3.5 font-normal text-[11px] leading-none tracking-[.14em] whitespace-nowrap">動作</th>
            </tr>
          </thead>
          <tbody>
            {sites.map((s) => (
              <tr key={s.id} style={{ borderTop: '1px solid var(--nm-border-hair)' }}>
                <td className="py-2 px-3.5 whitespace-nowrap">
                  <div className="mb-1">
                    <Link href={`/boss/projects/${s.id}`} className="underline nm-focus text-[13px]" style={{ color: 'var(--nm-text-primary)' }}>
                      {s.name}
                    </Link>
                  </div>
                  <form action={renameSite} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={s.id} />
                    <input
                      name="name"
                      defaultValue={s.name}
                      className="border-b outline-none bg-transparent nm-focus text-xs"
                      style={{ borderColor: 'transparent', color: 'var(--nm-text-muted)' }}
                    />
                    <button type="submit" className="text-xs nm-focus" style={{ color: 'var(--nm-text-muted)' }}>
                      存
                    </button>
                  </form>
                </td>
                <td className="py-2 px-3.5 whitespace-nowrap">
                  <form action={updateSiteMeta} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="customer_name" value={s.customer_name ?? ''} />
                    <select
                      name="category_id"
                      defaultValue={s.category_id ?? ''}
                      className="nm-input text-[12.5px]"
                      style={{ width: 'auto', minHeight: 30, padding: '2px 8px' }}
                    >
                      <option value="">未設</option>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <button type="submit" className="text-xs nm-focus" style={{ color: 'var(--nm-text-muted)' }}>存</button>
                  </form>
                </td>
                <td className="py-2 px-3.5 whitespace-nowrap">
                  <form action={updateSiteMeta} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="category_id" value={s.category_id ?? ''} />
                    <input
                      name="customer_name"
                      defaultValue={s.customer_name ?? ''}
                      placeholder="—"
                      className="border-b outline-none bg-transparent nm-focus text-xs"
                      style={{ borderColor: 'transparent', color: 'var(--nm-text-body)', width: 100 }}
                    />
                    <button type="submit" className="text-xs nm-focus" style={{ color: 'var(--nm-text-muted)' }}>存</button>
                  </form>
                </td>
                <td className="py-2 px-3.5 whitespace-nowrap">
                  {s.active ? (
                    <span className="nm-pill" style={{ color: 'var(--nm-success-glass-text)', background: 'rgba(126,207,157,0.08)', borderColor: 'rgba(126,207,157,0.26)' }}>啟用中</span>
                  ) : (
                    <span className="nm-pill nm-pill-muted line-through">已停用</span>
                  )}
                </td>
                <td className="py-2 px-3.5 whitespace-nowrap">
                  {s.in_use > 0 ? (
                    <span className="nm-pill nm-pill-warning">{s.in_use} 件</span>
                  ) : (
                    <span style={{ color: 'var(--nm-text-faint)' }}>—</span>
                  )}
                </td>
                <td className="py-2 px-3.5 whitespace-nowrap">
                  <form action={setSiteActive}>
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="active" value={s.active ? 'false' : 'true'} />
                    <button
                      type="submit"
                      disabled={s.active && s.in_use > 0}
                      className="nm-btn text-xs disabled:opacity-40"
                      style={{ padding: '4px 10px', minHeight: 'auto' }}
                      title={s.active && s.in_use > 0 ? '有設備在此專案,請先把設備移走' : ''}
                    >
                      {s.active ? '停用' : '啟用'}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
