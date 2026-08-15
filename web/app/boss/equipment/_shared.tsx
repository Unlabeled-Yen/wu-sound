// 設備庫存「跳線盤」共用 UI：位置軌（三方格）與跳線（色塊─線─色塊）。
// 檔名加底線——Next.js 不會把它當成路由，list/detail/mobile 都直接 import。
import type { EquipmentStatus } from '@/lib/types';
import { POSITION_SLOTS, SLOT_COLOR, SLOT_LABEL, statusToSlot, type PositionSlot } from '@/lib/equipment-view';

/** 清單列內的小型位置軌：16×12px 三格。§3-3、§6 data-slot-track 驗收點。 */
export function PositionTrackSm({ status }: { status: EquipmentStatus }) {
  const activeSlot = statusToSlot(status);
  return (
    <div data-slot-track style={{ display: 'flex', gap: 3 }}>
      {POSITION_SLOTS.map((slot) => {
        const active = slot === activeSlot;
        const color = SLOT_COLOR[slot];
        return (
          <span
            key={slot}
            data-slot={slot}
            data-active={active ? '1' : '0'}
            title={SLOT_LABEL[slot]}
            style={{
              width: 16,
              height: 12,
              display: 'block',
              background: active ? color.fill : 'transparent',
              border: active ? 'none' : '1px solid rgba(255,255,255,.18)',
            }}
          />
        );
      })}
    </div>
  );
}

/** 詳情頁放大版位置軌：52×34px，目前格加光暈，格下方標籤。 */
export function PositionTrackLg({ status }: { status: EquipmentStatus }) {
  const activeSlot = statusToSlot(status);
  return (
    <div data-slot-track style={{ display: 'flex', gap: 6 }}>
      {POSITION_SLOTS.map((slot) => {
        const active = slot === activeSlot;
        const color = SLOT_COLOR[slot];
        return (
          <div key={slot} style={{ textAlign: 'center' }}>
            <span
              data-slot={slot}
              data-active={active ? '1' : '0'}
              style={{
                width: 52,
                height: 34,
                display: 'block',
                marginBottom: 7,
                background: active ? color.fill : 'transparent',
                border: active ? 'none' : '1px solid rgba(255,255,255,.18)',
                boxShadow: active ? `0 0 16px ${color.glow}` : 'none',
              }}
            />
            <span
              style={{
                font: '400 10px/1 ui-monospace,SFMono-Regular,Menlo,monospace',
                color: active ? color.text : 'var(--nm-text-faint)',
              }}
            >
              {SLOT_LABEL[slot]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

interface CableBlockStyle {
  width: number;
  height: number;
  glow?: boolean;
}

function cableBlockStyle(slot: PositionSlot | null, retired: boolean, dims: CableBlockStyle): React.CSSProperties {
  if (retired) {
    return {
      width: dims.width,
      height: dims.height,
      display: 'block',
      background: 'rgba(224,122,122,.08)',
      border: '1.5px dashed var(--nm-danger)',
    };
  }
  if (!slot) {
    return {
      width: dims.width,
      height: dims.height,
      display: 'block',
      background: 'rgba(255,255,255,.07)',
      border: '1px solid rgba(255,255,255,.18)',
    };
  }
  const color = SLOT_COLOR[slot];
  return {
    width: dims.width,
    height: dims.height,
    display: 'block',
    background: color.fill,
    boxShadow: dims.glow ? `0 0 16px ${color.glow}` : undefined,
  };
}

/** 履歷列的小跳線：14×11 色塊 ── 16×1 線 ── 14×11 色塊。 */
export function PatchCableHistory({ from, to }: { from: EquipmentStatus; to: EquipmentStatus }) {
  const fromSlot = statusToSlot(from);
  const toSlot = statusToSlot(to);
  const broken = to === 'retired';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, paddingTop: 2, flex: 'none' }}>
      <span style={cableBlockStyle(fromSlot, from === 'retired', { width: 14, height: 11 })} />
      <span
        style={{
          width: 16,
          height: 1,
          display: 'block',
          background: broken ? 'var(--nm-danger)' : 'rgba(255,255,255,.3)',
        }}
      />
      <span style={cableBlockStyle(toSlot, broken, { width: 14, height: 11 })} />
    </div>
  );
}

/** 移動對話框的大跳線：64×40（手機 78×48）色塊 ── 線 ── 色塊，兩塊外發光。 */
export function PatchCableDialog({
  from,
  to,
  mobile = false,
}: {
  from: EquipmentStatus;
  to: EquipmentStatus;
  mobile?: boolean;
}) {
  const fromSlot = statusToSlot(from);
  const toSlot = statusToSlot(to);
  const broken = to === 'retired';
  const dims = mobile ? { width: 78, height: 48 } : { width: 64, height: 40 };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: mobile ? 24 : 18 }}>
      <div style={{ flex: 'none', textAlign: 'center' }}>
        <span style={cableBlockStyle(fromSlot, from === 'retired', { ...dims, glow: true })} />
        <div style={{ marginTop: 8, font: '400 10px/1 ui-monospace,SFMono-Regular,Menlo,monospace', color: fromSlot ? SLOT_COLOR[fromSlot].text : 'var(--nm-text-muted)' }}>
          {fromSlot ? SLOT_LABEL[fromSlot] : '已淘汰'}
        </div>
      </div>
      <span
        style={{
          flex: 1,
          height: 1,
          display: 'block',
          background: broken ? 'var(--nm-danger)' : '#f0f0f2',
          opacity: broken ? 0.7 : 0.5,
        }}
      />
      <div style={{ flex: 'none', textAlign: 'center' }}>
        <span style={cableBlockStyle(toSlot, broken, { ...dims, glow: true })} />
        <div style={{ marginTop: 8, font: '400 10px/1 ui-monospace,SFMono-Regular,Menlo,monospace', color: broken ? 'var(--nm-danger-glass-text)' : toSlot ? SLOT_COLOR[toSlot].text : 'var(--nm-text-muted)' }}>
          {toSlot ? SLOT_LABEL[toSlot] : '已淘汰'}
        </div>
      </div>
    </div>
  );
}

/** 整批徽章——只在 quantity > 1 時使用（禁止事項：不給部分數量欄位）。 */
export function BatchBadge() {
  return (
    <span
      style={{
        padding: '2px 5px',
        borderRadius: 4,
        background: 'rgba(255,255,255,.07)',
        font: '400 9.5px/1.3 "Noto Sans TC",sans-serif',
        color: 'var(--nm-text-secondary)',
      }}
    >
      整批
    </span>
  );
}
