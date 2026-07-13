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
        <h1 className="text-xl font-semibold">案場管理</h1>
        <p className="text-sm text-neutral-500 mt-0.5">共 {sites.length} 個案場。停用後不會出現在新的下拉選單,但歷史紀錄保留。</p>
      </div>

      {error ? (
        <div className="rounded border border-red-300 bg-red-50 text-red-700 p-3 text-sm mb-4">
          讀取失敗:{error.message}
        </div>
      ) : null}

      <form action={createSite} className="flex gap-2 items-center mb-6 max-w-lg">
        <input
          name="name"
          required
          placeholder="新增案場名稱"
          className="flex-1 rounded border border-neutral-300 dark:border-neutral-700 px-3 py-2 bg-transparent text-sm"
        />
        <button
          type="submit"
          className="rounded bg-neutral-900 dark:bg-white text-white dark:text-black px-3 py-2 text-sm"
        >
          新增
        </button>
      </form>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-neutral-500 border-b border-neutral-200 dark:border-neutral-800">
            <th className="py-2 pr-3">名稱</th>
            <th className="py-2 pr-3">狀態</th>
            <th className="py-2 pr-3">目前在場設備</th>
            <th className="py-2 pr-3">動作</th>
          </tr>
        </thead>
        <tbody>
          {sites.map((s) => (
            <tr key={s.id} className="border-b border-neutral-100 dark:border-neutral-900">
              <td className="py-2 pr-3">
                <form action={renameSite} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={s.id} />
                  <input
                    name="name"
                    defaultValue={s.name}
                    className="border-b border-transparent focus:border-neutral-400 outline-none bg-transparent"
                  />
                  <button type="submit" className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white">
                    存
                  </button>
                </form>
              </td>
              <td className="py-2 pr-3">
                {s.active ? (
                  <span className="text-emerald-700 dark:text-emerald-400">啟用中</span>
                ) : (
                  <span className="text-neutral-500 line-through">已停用</span>
                )}
              </td>
              <td className="py-2 pr-3">
                {s.in_use > 0 ? (
                  <span className="text-amber-600">{s.in_use} 件</span>
                ) : (
                  <span className="text-neutral-400">—</span>
                )}
              </td>
              <td className="py-2 pr-3">
                <form action={setSiteActive}>
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="active" value={s.active ? 'false' : 'true'} />
                  <button
                    type="submit"
                    disabled={s.active && s.in_use > 0}
                    className="rounded border border-neutral-300 dark:border-neutral-700 px-2 py-1 text-xs disabled:opacity-40"
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
  );
}
