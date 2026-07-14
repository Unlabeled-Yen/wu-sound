import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/supabase';
import {
  EQUIPMENT_CATEGORY_LABEL,
  EQUIPMENT_STATUS_LABEL,
  type EquipmentCategory,
  type EquipmentStatus,
} from '@/lib/types';
import { EQUIPMENT_STATUS_ORDER } from '@/lib/equipment-validation';

export const dynamic = 'force-dynamic';

const CATEGORIES = Object.keys(EQUIPMENT_CATEGORY_LABEL) as EquipmentCategory[];
const STATUSES = Object.keys(EQUIPMENT_STATUS_LABEL) as EquipmentStatus[];

function statusPillClass(status: EquipmentStatus): string {
  switch (status) {
    case 'in_storage':
      return 'nm-pill nm-pill-neutral';
    case 'on_site':
      return 'nm-pill nm-pill-warning';
    case 'in_repair':
      return 'nm-pill nm-pill-danger';
    case 'retired':
      return 'nm-pill nm-pill-muted line-through';
  }
}

interface Row {
  id: string;
  name: string;
  brand: string | null;
  model_number: string | null;
  category: EquipmentCategory;
  quantity: number;
  unit: string;
  status: EquipmentStatus;
  current_site_id: string | null;
  sites: { name: string } | null;
}

export default async function BossEquipmentPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q || '').trim();
  const category = sp.category || '';
  const status = sp.status || '';

  const sb = getSupabaseAdmin();
  let query = sb
    .from('equipment')
    .select('id, name, brand, model_number, category, quantity, unit, status, current_site_id, sites:current_site_id(name)')
    .limit(500);

  if (q) {
    const like = `%${q.replace(/[%_]/g, '')}%`;
    query = query.or(`name.ilike.${like},model_number.ilike.${like},brand.ilike.${like}`);
  }
  if (category && CATEGORIES.includes(category as EquipmentCategory)) {
    query = query.eq('category', category);
  }
  if (status && STATUSES.includes(status as EquipmentStatus)) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  const rows: Row[] = ((data as any) || []).slice().sort((a: Row, b: Row) => {
    const sa = EQUIPMENT_STATUS_ORDER[a.status] ?? 99;
    const sb2 = EQUIPMENT_STATUS_ORDER[b.status] ?? 99;
    if (sa !== sb2) return sa - sb2;
    return String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hant');
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold" style={{ color: 'var(--nm-text-primary)' }}>
          設備庫存 ({rows.length})
        </h1>
        <Link href="/boss/equipment/new" className="nm-btn-solid text-[13px] whitespace-nowrap">
          新增設備
        </Link>
      </div>

      <form method="get" className="flex flex-wrap gap-2 items-center">
        <input
          name="q"
          defaultValue={q}
          placeholder="名稱 / 型號 / 品牌"
          className="nm-input text-[13px] min-w-[220px]"
        />
        <select name="category" defaultValue={category} className="nm-btn text-[13px]">
          <option value="">全部分類</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{EQUIPMENT_CATEGORY_LABEL[c]}</option>
          ))}
        </select>
        <select name="status" defaultValue={status} className="nm-btn text-[13px]">
          <option value="">全部狀態</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{EQUIPMENT_STATUS_LABEL[s]}</option>
          ))}
        </select>
        <button type="submit" className="nm-btn nm-focus text-[13px]">
          篩選
        </button>
        {(q || category || status) && (
          <Link href="/boss/equipment" className="text-[13px] underline underline-offset-2" style={{ color: 'var(--nm-text-muted)' }}>
            重設
          </Link>
        )}
      </form>

      {error && (
        <div className="rounded-xl nm-inset p-3 text-[13px]" style={{ color: 'var(--nm-danger)' }}>
          讀取失敗:{error.message}
        </div>
      )}

      <div className="rounded-2xl nm-raised overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]" style={{ minWidth: 780, borderCollapse: 'collapse' }}>
            <thead style={{ background: 'rgba(20,20,24,0.92)' }}>
              <tr style={{ color: 'var(--nm-text-muted)' }}>
                <th className="text-left px-3 py-2 font-normal whitespace-nowrap">名稱</th>
                <th className="text-left px-3 py-2 font-normal whitespace-nowrap">品牌</th>
                <th className="text-left px-3 py-2 font-normal whitespace-nowrap">型號</th>
                <th className="text-left px-3 py-2 font-normal whitespace-nowrap">類別</th>
                <th className="text-left px-3 py-2 font-normal whitespace-nowrap">數量</th>
                <th className="text-left px-3 py-2 font-normal whitespace-nowrap">狀態</th>
                <th className="text-left px-3 py-2 font-normal whitespace-nowrap">目前專案</th>
                <th className="text-left px-3 py-2 font-normal whitespace-nowrap">動作</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center whitespace-nowrap" style={{ color: 'var(--nm-text-muted)' }}>
                    沒有符合條件的設備
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <Link href={`/boss/equipment/${r.id}`} className="hover:underline font-medium nm-focus" style={{ color: 'var(--nm-text-body)' }}>
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>{r.brand || '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>{r.model_number || '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>{EQUIPMENT_CATEGORY_LABEL[r.category]}</td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>{r.quantity} {r.unit}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={statusPillClass(r.status)}>
                      {EQUIPMENT_STATUS_LABEL[r.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>
                    {r.status === 'on_site' ? (r.sites?.name || '(未知)') : '—'}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <Link href={`/boss/equipment/${r.id}`} className="text-[13px] underline nm-focus" style={{ color: 'var(--nm-text-muted)' }}>
                      詳情
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
