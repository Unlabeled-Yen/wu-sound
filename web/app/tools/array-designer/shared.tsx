'use client';

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CatalogItem } from '@/lib/types';

export function fmt(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return n.toFixed(digits);
}

// 內部錯誤(例如喇叭數量超出上限)不直接把技術訊息丟給使用者,
// 改成可理解的中文提示,請他調整輸入而非除錯。
export const GENERIC_ERROR_MSG =
  '目前輸入組合超出可設計範圍(通常是目標值過大或距離過近),請調整數值再試一次。';

export function ErrorNote({ message }: { message: string }) {
  return (
    <p className="text-[13px]" style={{ color: 'var(--nm-danger-glass-text)' }}>
      {message}
    </p>
  );
}

export function ValidationNote({ message }: { message: string }) {
  return (
    <p className="text-[12px]" style={{ color: 'var(--nm-warning-glass-text)' }}>
      {message}
    </p>
  );
}

// ⓘ 提示氣泡——原軟體每個欄位旁邊都有,原文抽不出來(bytecode 沒存字串常數),
// 改用中文白話寫,而且每句話都錨回整個 app 的目標(觀眾席有沒有落在好聲音區間
// 裡),不是逐字翻譯欄位名稱。
//
// 用 portal 掛到 document.body,不是原地 absolute——欄位所在的 nm-raised/
// nm-inset 卡片用了 backdrop-filter,CSS 規範裡 backdrop-filter 會建立新的
// stacking context,把子元素的 z-index 鎖在卡片自己的層裡出不去。當提示框跟
// 右側圖表面板是不同卡片(不同 stacking context)時,先出現在 DOM 裡的卡片
// 永遠疊不過後出現的卡片,不管 z-index 開多高都一樣,導致提示框被圖表蓋掉。
// portal 讓提示框直接掛在 body 下面,跳出所有祖先的 stacking context。
export function InfoTip({ text }: { text: string }) {
  const iconRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  function show() {
    const r = iconRef.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.min(Math.max(r.left + r.width / 2, 128), window.innerWidth - 128);
    setPos({ top: r.top - 8, left });
  }
  function hide() {
    setPos(null);
  }

  return (
    <span className="relative inline-block align-middle ml-1">
      <span
        ref={iconRef}
        className="inline-flex items-center justify-center w-[14px] h-[14px] rounded-full text-[10px] cursor-help select-none"
        style={{ color: 'var(--nm-text-muted)', border: '1px solid var(--nm-text-muted)' }}
        tabIndex={0}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        i
      </span>
      {pos && typeof document !== 'undefined' && createPortal(
        <span
          role="tooltip"
          className="fixed pointer-events-none -translate-x-1/2 -translate-y-full z-50 w-[240px] text-[11px] leading-relaxed rounded-lg p-2.5 shadow-lg"
          style={{ top: pos.top, left: pos.left, background: '#1a1c20', color: 'var(--nm-text-secondary)', border: '1px solid var(--nm-border)' }}
        >
          {text}
        </span>,
        document.body,
      )}
    </span>
  );
}

export function NumberField({
  label, value, onChange, tip,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  tip?: string;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-sm inline-flex items-center" style={{ color: 'var(--nm-text-secondary)' }}>
        {label}
        {tip && <InfoTip text={tip} />}
      </span>
      <input
        type="number"
        inputMode="decimal"
        className="nm-input w-full"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

// danger:true 對照原軟體「Max Width (-6dB)」用紅字——那是理論上限,不是建議值,
// 紅色是警示語意(達到這個寬度已經開始有可聽出的重疊),不是單純配色差異。
export function Stat({ label, value, danger, tip }: { label: string; value: string; danger?: boolean; tip?: string }) {
  return (
    <div>
      <div className="text-[11px] inline-flex items-center" style={{ color: 'var(--nm-text-muted)' }}>
        {label}
        {tip && <InfoTip text={tip} />}
      </div>
      <div className="text-lg font-semibold" style={{ color: danger ? 'var(--nm-danger-glass-text)' : 'var(--nm-text-primary)' }}>{value}</div>
    </div>
  );
}

// 圖例區塊,對照原軟體左側面板的「Legend & Definitions」——原本 Wu 沒有這塊,
// 使用者(現場技師,非聲學專業)不一定看得懂 Min/Max/Unity/Limit 代表什麼。
// 每句定義都錨回整個工具的目標:「觀眾席距離有沒有落在好聲音區間裡」,不是
// 逐字翻譯原文的抽象定義。
// 對照原軟體英文版圖例(Aud 紫、Min/Max 同色系紅、Unity 橙、Limit 灰)——原本
// Min 誤用琥珀色、Max 誤用灰色(照抄畫布上 Min/Max 背景參考線的 fill key
// 'result'/'limit',但那是兩條不同構造的線,顏色本來就不同;圖例文字要對的
// 是原軟體圖例本身的配色,不是畫布線條的 fill key)。Min/Max 沿用專案既有的
// danger 紅(--nm-danger),跟「Max Width(-6dB)」警示色同一家族,不是另外
// 挑一個新紅。
const LEGEND_ITEMS: { label: string; color: string; text: string }[] = [
  { label: 'Aud', color: '#a068d5', text: '觀眾席距離。整份設計要回答的問題就是:這個距離有沒有落在 Min 和 Max 之間。' },
  { label: 'Min', color: '#e07a7a', text: '縫隙消失的最淺深度。觀眾比這更近,會剛好坐在兩支喇叭中間的音量凹陷裡,忽大忽小。' },
  { label: 'Max', color: '#e07a7a', text: '重疊開始過度的深度。觀眾比這更遠,相鄰喇叭訊號重疊過多,開始互相干涉、音質變髒。' },
  { label: 'Unity', color: '#b39330', text: '相鄰喇叭 -6dB 邊緣正好交會的深度——聲音銜接最完美的位置,是縫隙徹底消失的起點。' },
  { label: 'Limit', color: '#8b8f98', text: '三支喇叭訊號都疊在一起的深度,是重疊惡化的絕對邊界,比這更遠問題只會更嚴重。' },
];

export function Legend() {
  return (
    <div className="rounded-xl p-3 space-y-1.5" style={{ border: '1px solid var(--nm-border)' }}>
      <div className="text-[11px] font-semibold mb-1" style={{ color: 'var(--nm-text-secondary)' }}>圖例說明</div>
      {LEGEND_ITEMS.map((item) => (
        <div key={item.label} className="text-[11px] flex gap-1.5" style={{ color: 'var(--nm-text-muted)' }}>
          <span className="font-semibold shrink-0" style={{ color: item.color }}>{item.label}:</span>
          <span>{item.text}</span>
        </div>
      ))}
    </div>
  );
}

export function ResultPanel({
  title, stats, rangeMinM, rangeMaxM, children,
}: {
  title: string;
  stats: { label: string; value: string; danger?: boolean; tip?: string }[];
  rangeMinM: number;
  rangeMaxM: number;
  children?: React.ReactNode;
}) {
  return (
    <section className="nm-inset rounded-2xl p-4 space-y-4">
      {children}
      <div>
        <h2 className="text-[15px] font-semibold mb-3" style={{ color: 'var(--nm-text-primary)' }}>{title}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {stats.map((s) => (
            <Stat key={s.label} label={s.label} value={s.value} danger={s.danger} tip={s.tip} />
          ))}
        </div>
        <div className="pt-3 mt-3 border-t" style={{ borderColor: 'var(--nm-border)' }}>
          <div className="text-[11px] inline-flex items-center" style={{ color: 'var(--nm-text-muted)' }}>
            有效覆蓋範圍
            <InfoTip text="這組陣列配置真正好聲音的深度區間。觀眾席距離只要落在這個區間裡就是及格的設計;離開這個區間,不是縫隙沒接上,就是開始重疊出問題。" />
          </div>
          <div className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>
            {fmt(rangeMinM)} m ~ {fmt(rangeMaxM)} m
          </div>
        </div>
        <p className="text-[12px] pt-2" style={{ color: 'var(--nm-text-muted)' }}>
          此為自由場等腰弧列幾何理論值,未計入場地反射、器材規格誤差等現場變因,實際佈點仍需現場覆核。
        </p>
        <div className="pt-3 mt-3 border-t" style={{ borderColor: 'var(--nm-border)' }}>
          <Legend />
        </div>
      </div>
    </section>
  );
}

// 「喇叭規格」共用區塊:5 個分頁都要填 Speaker Cov(phi),可選從價目表帶入型號
// (catalog_items 目前沒有覆蓋角欄位,選了也只能提醒手動輸入,行為同 spl-calculator)。
export function useSpeakerCov(defaultDeg: string, speakers: CatalogItem[]) {
  const [speakerId, setSpeakerId] = useState('');
  const [coverageDeg, setCoverageDeg] = useState(defaultDeg);
  const selectedSpeaker = speakers.find((s) => s.id === speakerId);

  function onSpeakerChange(id: string) {
    setSpeakerId(id);
  }

  function reset() {
    setSpeakerId('');
    setCoverageDeg(defaultDeg);
  }

  return { speakerId, coverageDeg, setCoverageDeg, selectedSpeaker, onSpeakerChange, reset };
}

// 分頁標題 + ↺ Reset 按鈕,對照原軟體每個分頁右上角的 Reset(Wu 原本沒有)。
export function TabHeader({ title, onReset }: { title: string; onReset: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-[15px] font-semibold" style={{ color: 'var(--nm-text-primary)' }}>{title}</h2>
      <button
        type="button"
        onClick={onReset}
        className="text-[12px] flex items-center gap-1 hover:opacity-100"
        style={{ color: 'var(--nm-text-secondary)', opacity: 0.8 }}
      >
        ↺ Reset
      </button>
    </div>
  );
}

export function SpeakerCovSection({
  speakers, speakerId, onSpeakerChange, coverageDeg, setCoverageDeg, selectedSpeaker,
}: {
  speakers: CatalogItem[];
  speakerId: string;
  onSpeakerChange: (id: string) => void;
  coverageDeg: string;
  setCoverageDeg: (v: string) => void;
  selectedSpeaker: CatalogItem | undefined;
}) {
  return (
    <section className="nm-raised rounded-2xl p-4 space-y-3">
      <h2 className="text-[15px] font-semibold" style={{ color: 'var(--nm-text-primary)' }}>喇叭規格</h2>
      {speakers.length > 0 && (
        <label className="grid gap-1">
          <span className="text-sm" style={{ color: 'var(--nm-text-secondary)' }}>從價目表帶入(選填,僅供對照型號)</span>
          <select className="nm-input w-full" value={speakerId} onChange={(e) => onSpeakerChange(e.target.value)}>
            <option value="">— 手動輸入 —</option>
            {speakers.map((s) => (
              <option key={s.id} value={s.id}>{[s.brand, s.name].filter(Boolean).join(' ')}</option>
            ))}
          </select>
        </label>
      )}
      {selectedSpeaker && (
        <ValidationNote message="此品項尚未建檔覆蓋角規格,請查廠商 datasheet 手動輸入。" />
      )}
      <NumberField
        label={`水平覆蓋角(deg,-6dB 名義值${selectedSpeaker ? `,${selectedSpeaker.name} 規格未建檔` : ''})`}
        value={coverageDeg}
        onChange={setCoverageDeg}
        tip="單支喇叭在 -6dB(音量減半處)的水平擴散角,由喇叭型號決定——換喇叭就要換這個值。這個角度是整份計算的起點,喇叭與喇叭的縫隙、重疊全部由它推出來。"
      />
    </section>
  );
}
