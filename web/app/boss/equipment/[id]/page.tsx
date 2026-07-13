import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSupabaseAdmin } from '@/lib/supabase';
import {
  EQUIPMENT_CATEGORY_LABEL,
  EQUIPMENT_STATUS_LABEL,
  formatEquipmentLocation,
  type EquipmentCategory,
  type EquipmentStatus,
} from '@/lib/types';
import { updateEquipment } from './actions';
import MoveDialog from './MoveDialog';
import RetireButton from './RetireButton';

export const dynamic = 'force-dynamic';

interface EquipmentDetail {
  id: string;
  name: string;
  brand: string | null;
  model_number: string | null;
  category: EquipmentCategory;
  serial_number: string | null;
  quantity: number;
  unit: string;
  status: EquipmentStatus;
  current_site_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  sites: { name: string } | null;
}

interface Movement {
  id: number;
  moved_at: string;
  from_status: EquipmentStatus;
  to_status: EquipmentStatus;
  from_site_id: string | null;
  to_site_id: string | null;
  notes: string | null;
  users: { name: string } | null;
  from_site: { name: string } | null;
  to_site: { name: string } | null;
}

export default async function EquipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = getSupabaseAdmin();

  const eq = await sb
    .from('equipment')
    .select('id, name, brand, model_number, category, serial_number, quantity, unit, status, current_site_id, notes, created_at, updated_at, sites:current_site_id(name)')
    .eq('id', id)
    .maybeSingle();
  if (eq.error) {
    return <div className="p-3 rounded bg-red-50 border border-red-300 text-red-800">讀取失敗:{eq.error.message}</div>;
  }
  if (!eq.data) notFound();
  const data = eq.data as unknown as EquipmentDetail;

  const mv = await sb
    .from('equipment_movements')
    .select('id, moved_at, from_status, to_status, from_site_id, to_site_id, notes, users:moved_by(name), from_site:from_site_id(name), to_site:to_site_id(name)')
    .eq('equipment_id', id)
    .order('moved_at', { ascending: false })
    .limit(200);
  const movements = (mv.data as unknown as Movement[]) || [];

  async function saveAction(formData: FormData) {
    'use server';
    await updateEquipment(id, formData);
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/boss/equipment" className="text-sm underline">← 大型設備</Link>
          <h1 className="text-xl font-semibold mt-1">{data.name}</h1>
        </div>
      </div>

      <section className="rounded border border-neutral-200 dark:border-neutral-800 p-4 space-y-3">
        <h2 className="font-semibold">基本資料</h2>
        <form action={saveAction} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <F label="名稱 *"><input name="name" defaultValue={data.name} required className={inp} /></F>
            <F label="分類">
              <div className={`${inp} bg-neutral-100 dark:bg-neutral-800`}>
                {EQUIPMENT_CATEGORY_LABEL[data.category]}
              </div>
            </F>
            <F label="品牌"><input name="brand" defaultValue={data.brand ?? ''} className={inp} /></F>
            <F label="型號"><input name="model_number" defaultValue={data.model_number ?? ''} className={inp} /></F>
            <F label="序號"><input name="serial_number" defaultValue={data.serial_number ?? ''} className={inp} /></F>
            <div className="grid grid-cols-2 gap-2">
              <F label="數量"><input name="quantity" type="number" min={1} defaultValue={data.quantity} className={inp} /></F>
              <F label="單位"><input name="unit" defaultValue={data.unit} className={inp} /></F>
            </div>
          </div>
          <F label="備註"><textarea name="notes" defaultValue={data.notes ?? ''} rows={3} className={inp} /></F>
          <button type="submit" className="px-4 py-2 rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
            儲存基本資料
          </button>
        </form>
      </section>

      <section className="rounded border border-neutral-200 dark:border-neutral-800 p-4 space-y-3">
        <h2 className="font-semibold">目前狀態</h2>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-neutral-500">狀態 · 位置</div>
            <div className="text-lg">{formatEquipmentLocation(data.status, data.sites?.name)}</div>
          </div>
          <MoveDialog equipmentId={data.id} currentStatus={data.status} currentSiteId={data.current_site_id} />
        </div>
      </section>

      <section className="rounded border border-neutral-200 dark:border-neutral-800 p-4 space-y-3">
        <h2 className="font-semibold">移動歷史 ({movements.length})</h2>
        {movements.length === 0 ? (
          <div className="text-sm text-neutral-500">目前沒有移動記錄</div>
        ) : (
          <ol className="space-y-3">
            {movements.map((m) => (
              <li key={m.id} className="border-l-2 border-neutral-300 dark:border-neutral-700 pl-3">
                <div className="text-xs text-neutral-500">
                  {new Date(m.moved_at).toLocaleString('zh-Hant')} · {m.users?.name || '(未知)'}
                </div>
                <div className="text-sm">
                  {formatEquipmentLocation(m.from_status, m.from_site?.name)}
                  {' → '}
                  <strong>{formatEquipmentLocation(m.to_status, m.to_site?.name)}</strong>
                </div>
                {m.notes && <div className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">備註:{m.notes}</div>}
              </li>
            ))}
          </ol>
        )}
      </section>

      {data.status !== 'retired' && (
        <section className="rounded border border-red-200 dark:border-red-900 p-4 space-y-2">
          <h2 className="font-semibold text-red-700 dark:text-red-300">危險區</h2>
          <RetireButton id={data.id} />
        </section>
      )}
    </div>
  );
}

const inp = 'w-full px-2 py-1.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900';

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm text-neutral-700 dark:text-neutral-300">{label}</span>
      {children}
    </label>
  );
}
