import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSupabaseAdmin } from '@/lib/supabase';
import {
  EQUIPMENT_CATEGORY_LABEL,
  type EquipmentCategory,
  type EquipmentStatus,
} from '@/lib/types';
import { REPAIR_STUCK_DAYS, SITE_STUCK_DAYS, daysSince, formatDateTime } from '@/lib/equipment-view';
import { updateEquipment } from './actions';
import MoveDialog from './MoveDialog';
import HistoryList, { type HistoryItem } from './HistoryList';
import { PositionTrackLg } from '../_shared';

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

interface MovementRow {
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
    return (
      <div className="rounded-xl nm-inset p-3" style={{ color: 'var(--nm-danger)' }}>
        讀取失敗:{eq.error.message}
      </div>
    );
  }
  if (!eq.data) notFound();
  const data = eq.data as unknown as EquipmentDetail;

  const mv = await sb
    .from('equipment_movements')
    .select('id, moved_at, from_status, to_status, from_site_id, to_site_id, notes, users:moved_by(name), from_site:from_site_id(name), to_site:to_site_id(name)')
    .eq('equipment_id', id)
    .order('moved_at', { ascending: false })
    .limit(200);
  const movementError = !!mv.error;
  const movements = movementError ? [] : ((mv.data as unknown as MovementRow[]) || []);

  const historyItems: HistoryItem[] = movements.map((m) => ({
    id: m.id,
    moved_at: m.moved_at,
    from_status: m.from_status,
    to_status: m.to_status,
    from_site_name: m.from_site?.name ?? null,
    to_site_name: m.to_site?.name ?? null,
    mover_name: m.users?.name ?? null,
    notes: m.notes,
  }));

  const latest = movements[0] ?? null;
  const stuckDays = latest ? daysSince(latest.moved_at) : null;
  const isStuck =
    (data.status === 'in_repair' && stuckDays !== null && stuckDays >= REPAIR_STUCK_DAYS) ||
    (data.status === 'on_site' && stuckDays !== null && stuckDays >= SITE_STUCK_DAYS);

  async function saveAction(formData: FormData) {
    'use server';
    await updateEquipment(id, formData);
  }

  const titleLabel = data.status === 'in_repair' ? '維修中' : data.status === 'on_site' ? `在案場　${data.sites?.name ?? '(未知)'}` : '在庫房';
  const statusColor = data.status === 'in_repair' ? 'var(--nm-danger-glass-text)' : data.status === 'on_site' ? 'var(--nm-warning-glass-text)' : 'var(--nm-text-primary)';

  let explanation: string;
  if (!latest) {
    explanation = '無移動記錄——不知道這台是何時進入目前狀態的。';
  } else {
    const { date } = formatDateTime(latest.moved_at);
    const who = latest.users?.name || '(未知)';
    const noteFrag = latest.notes ? `　·　備註「${latest.notes}」` : '';
    if (data.status === 'in_repair') {
      explanation = `已經 ${stuckDays} 天沒有進度　·　${date} 由 ${who} 送出${noteFrag}`;
    } else if (data.status === 'on_site') {
      explanation = `在此案場 ${stuckDays} 天　·　${date} 由 ${who} 帶去${noteFrag}`;
    } else {
      explanation = `${date} 由 ${who} 回庫${noteFrag}`;
    }
  }

  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 560px', minWidth: 0, borderRadius: 18, background: 'rgba(19,19,23,.7)', border: '1px solid rgba(255,255,255,.12)', overflow: 'hidden' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid rgba(255,255,255,.07)' }}>
          <Link href="/boss/equipment" className="nm-focus" style={{ font: '400 12px/1 "Noto Sans TC",sans-serif', color: 'var(--nm-text-muted)', textDecoration: 'none', marginBottom: 9, display: 'inline-block' }}>
            ← 設備庫存
          </Link>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ font: '600 19px/1 "Noto Sans TC",sans-serif', color: 'var(--nm-text-primary)', marginBottom: 8 }}>{data.name}</div>
              <div style={{ font: '400 12px/1 ui-monospace,SFMono-Regular,Menlo,monospace', color: 'var(--nm-text-muted)' }}>
                {[data.brand, data.model_number, data.serial_number ? `SN ${data.serial_number}` : 'SN 缺'].filter(Boolean).join('　')}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <a
                href="#edit-panel"
                className="nm-focus"
                style={{ listStyle: 'none', minHeight: 40, display: 'inline-flex', alignItems: 'center', padding: '0 14px', borderRadius: 12, background: 'rgba(40,40,46,.4)', border: '1px solid rgba(255,255,255,.2)', font: '400 12.5px/1 "Noto Sans TC",sans-serif', color: 'var(--nm-text-body)', textDecoration: 'none' }}
              >
                編輯資料
              </a>
              {data.status !== 'retired' && (
                <MoveDialog equipmentId={data.id} currentStatus={data.status} currentSiteId={data.current_site_id} quantity={data.quantity} unit={data.unit} />
              )}
            </div>
          </div>
        </div>

        <div style={{ padding: '18px 22px', borderBottom: '1px solid rgba(255,255,255,.07)', background: 'rgba(8,8,10,.3)', display: 'flex', alignItems: 'center', gap: 26, flexWrap: 'wrap' }}>
          <PositionTrackLg status={data.status} />
          <div style={{ flex: '1 1 240px', minWidth: 0 }}>
            <div style={{ font: '500 15px/1 "Noto Sans TC",sans-serif', color: statusColor, marginBottom: 8 }}>{titleLabel}</div>
            <div style={{ font: '400 12.5px/1.6 "Noto Sans TC",sans-serif', color: isStuck ? 'var(--nm-danger-glass-text)' : 'var(--nm-text-secondary)' }}>{explanation}</div>
          </div>
          <div style={{ flex: 'none', display: 'flex', alignItems: 'baseline', gap: 7 }}>
            <span className="tabular-nums" style={{ font: '600 15px/1 ui-monospace,SFMono-Regular,Menlo,monospace', color: 'var(--nm-text-body)' }}>{data.quantity}</span>
            <span style={{ font: '400 12px/1 "Noto Sans TC",sans-serif', color: 'var(--nm-text-muted)' }}>{data.unit}</span>
            {data.quantity > 1 && (
              <span style={{ padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,.07)', font: '400 10px/1.3 "Noto Sans TC",sans-serif', color: 'var(--nm-text-muted)', marginLeft: 4 }}>
                整批移動
              </span>
            )}
          </div>
        </div>

        <div style={{ padding: '20px 22px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ font: '500 13px/1 "Noto Sans TC",sans-serif', color: 'var(--nm-text-body)' }}>履歷　{movements.length} 次移動</span>
            <span style={{ font: '400 11.5px/1 "Noto Sans TC",sans-serif', color: 'var(--nm-text-faint)' }}>最新在上　·　每一列都是一次跳線</span>
          </div>
          {movementError ? (
            <div className="rounded-xl nm-inset p-3 text-[13px]" style={{ color: 'var(--nm-danger)' }}>履歷讀取失敗:{mv.error?.message}</div>
          ) : (
            <HistoryList items={historyItems} />
          )}
        </div>
      </div>

      <div style={{ width: 400, flex: 'none', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <details id="edit-panel" className="rounded-2xl nm-raised p-4 space-y-3">
          <summary className="font-semibold cursor-pointer nm-focus" style={{ color: 'var(--nm-text-primary)' }}>編輯資料</summary>
          <form action={saveAction} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <F label="名稱 *"><input name="name" defaultValue={data.name} required className={inp} /></F>
              <F label="分類">
                <div className="nm-inset-sm rounded-lg px-2 py-1.5 text-[13.5px]" style={{ color: 'var(--nm-text-secondary)' }}>
                  {EQUIPMENT_CATEGORY_LABEL[data.category]}
                </div>
              </F>
              <F label="品牌"><input name="brand" defaultValue={data.brand ?? ''} className={inp} /></F>
              <F label="型號"><input name="model_number" defaultValue={data.model_number ?? ''} className={inp} /></F>
              <F label="序號 · 系統不檢查是否重複"><input name="serial_number" defaultValue={data.serial_number ?? ''} className={inp} /></F>
              <div className="grid grid-cols-2 gap-2">
                <F label="數量 · 整批一起移動,不支援部分調度"><input name="quantity" type="number" min={1} defaultValue={data.quantity} className={inp} /></F>
                <F label="單位"><input name="unit" defaultValue={data.unit} className={inp} /></F>
              </div>
            </div>
            <F label="備註"><textarea name="notes" defaultValue={data.notes ?? ''} rows={3} className={inp} /></F>
            <button type="submit" className="nm-btn-solid text-[13.5px]">
              儲存基本資料
            </button>
          </form>
          {data.status === 'retired' && (
            <div className="text-[12.5px]" style={{ color: 'var(--nm-text-muted)' }}>
              已淘汰是終態，不提供移動入口——想再啟用要重新登記一筆新的設備。
            </div>
          )}
        </details>
      </div>
    </div>
  );
}

const inp = 'nm-input w-full text-[13.5px]';

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>{label}</span>
      {children}
    </label>
  );
}
