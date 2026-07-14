import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';
import { createSite, renameSite, setSiteActive } from './actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Row {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
  in_use: number;
}

export default async function BossSitesPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'boss') redirect('/staff');

  const sb = getSupabaseAdmin();
  const [{ data: sitesData, error }, { data: eqRefs }] = await Promise.all([
    sb.from('sites').select('id, name, active, created_at').order('active', { ascending: false }).order('name'),
    sb.from('equipment').select('current_site_id').eq('status', 'on_site'),
  ]);

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
        <h1 className="text-xl font-semibold" style={{ color: 'var(--nm-text-primary)' }}>案場管理</h1>
        <p className="text-[13px] mt-0.5" style={{ color: 'var(--nm-text-secondary)' }}>共 {sites.length} 個案場。停用後不會出現在新的下拉選單,但歷史紀錄保留。</p>
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

      <form action={createSite} className="flex gap-2 items-center mb-6 max-w-lg">
        <input
          name="name"
          required
          placeholder="新增案場名稱"
          className="flex-1 nm-input text-[13px]"
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
              <th className="text-left py-2.5 px-3.5 font-normal text-xs whitespace-nowrap">名稱</th>
              <th className="text-left py-2.5 px-3.5 font-normal text-xs whitespace-nowrap">狀態</th>
              <th className="text-left py-2.5 px-3.5 font-normal text-xs whitespace-nowrap">目前在場設備</th>
              <th className="text-left py-2.5 px-3.5 font-normal text-xs whitespace-nowrap">動作</th>
            </tr>
          </thead>
          <tbody>
            {sites.map((s) => (
              <tr key={s.id} style={{ borderTop: '1px solid var(--nm-border-hair)' }}>
                <td className="py-2 px-3.5 whitespace-nowrap">
                  <form action={renameSite} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={s.id} />
                    <input
                      name="name"
                      defaultValue={s.name}
                      className="border-b outline-none bg-transparent nm-focus"
                      style={{ borderColor: 'transparent', color: 'var(--nm-text-body)' }}
                    />
                    <button type="submit" className="text-xs nm-focus" style={{ color: 'var(--nm-text-muted)' }}>
                      存
                    </button>
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
                      title={s.active && s.in_use > 0 ? '有設備在此案場,請先把設備移走' : ''}
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
