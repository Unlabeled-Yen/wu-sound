'use client';

import { useState } from 'react';
import { fmt, Legend } from './shared';

// 答案帶 + 深度軸:支數/間距先行,取代原本表單在上、答案在最下的順序。
// 深度軸(0–chartMax m)取代 5 條圖例文字牆——名詞直接標在軸上,原本常駐的
// Legend() 改成「圖例說明 ▾」收合(內容保留不刪,只是預設收起來)。
export function ArrayAnswerBand({
  quantity, spacingM, audienceDistM, rangeMinM, rangeMaxM, unityDistM, limitDepthM,
}: {
  quantity: number;
  spacingM: number;
  audienceDistM: number;
  rangeMinM: number;
  rangeMaxM: number;
  unityDistM: number;
  limitDepthM: number;
}) {
  const [legendOpen, setLegendOpen] = useState(false);

  const finiteMax = Number.isFinite(rangeMaxM) ? rangeMaxM : unityDistM * 2;
  const chartMaxM = Math.max(finiteMax, limitDepthM, audienceDistM) * 1.15;
  const pct = (m: number) => Math.max(0, Math.min(100, (m / chartMaxM) * 100));

  const minPct = pct(rangeMinM);
  const maxPct = pct(finiteMax);
  const audPct = pct(audienceDistM);
  const limitPct = pct(limitDepthM);

  const inRange = audienceDistM >= rangeMinM && audienceDistM <= finiteMax;
  const tooClose = audienceDistM < rangeMinM;

  return (
    <div className="rounded-[20px] nm-raised-sm px-6 py-6">
      <div className="flex flex-wrap items-end gap-10 mb-7">
        <div>
          <div className="text-[12.5px] mb-3" style={{ color: 'var(--nm-text-muted)' }}>建議配置</div>
          <div className="flex items-baseline gap-2.5">
            <span className="tabular-nums text-[34px] lg:text-[46px]" style={{ fontWeight: 600, lineHeight: 1, color: 'var(--nm-text-primary)', textShadow: '0 1px 3px rgba(0,0,0,.65)' }}>{quantity}</span>
            <span style={{ fontSize: 17, color: 'var(--nm-text-secondary)' }}>支</span>
            <span style={{ fontSize: 22, color: 'var(--nm-text-faint)' }}>／</span>
            <span className="tabular-nums text-[26px] lg:text-[34px]" style={{ fontWeight: 600, lineHeight: 1, color: 'var(--nm-text-primary)' }}>{fmt(spacingM)}</span>
            <span style={{ fontSize: 17, color: 'var(--nm-text-secondary)' }}>m 間距</span>
          </div>
        </div>
        <div className="flex-1" />
        <div
          className="flex items-center gap-2.5 px-4 py-3 rounded-[13px]"
          style={
            inRange
              ? { background: 'rgba(126,207,157,.16)', border: '1px solid rgba(126,207,157,.4)' }
              : { background: 'rgba(224,122,122,.14)', border: '1px solid rgba(224,122,122,.4)' }
          }
        >
          <span className="text-[13px] font-semibold" style={{ color: inRange ? 'var(--nm-success-glass-text)' : 'var(--nm-danger-glass-text)' }}>
            {inRange
              ? `觀眾席 ${fmt(audienceDistM)} m 落在好聲音區間內`
              : `觀眾席 ${fmt(audienceDistM)} m ${tooClose ? '太近' : '太遠'}——落在好聲音區間外`}
          </span>
        </div>
      </div>

      {/* 深度軸:綠帶＝好聲音深度區間,Min/Max 紅線、Limit 灰線、Aud 紫線(3px 最顯著)。 */}
      <div style={{ position: 'relative', height: 106 }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 44, height: 20, borderRadius: 3, background: 'rgba(255,255,255,.05)' }} />
        {Number.isFinite(maxPct - minPct) && maxPct > minPct && (
          <div style={{ position: 'absolute', left: `${minPct}%`, width: `${maxPct - minPct}%`, top: 44, height: 20, background: 'rgba(126,207,157,.55)', borderRadius: 3 }} />
        )}
        <div style={{ position: 'absolute', left: `${minPct}%`, top: 36, bottom: 26, width: 2, background: '#e07a7a' }} />
        {Number.isFinite(maxPct) && <div style={{ position: 'absolute', left: `${maxPct}%`, top: 36, bottom: 26, width: 2, background: '#e07a7a' }} />}
        <div style={{ position: 'absolute', left: `${limitPct}%`, top: 40, bottom: 30, width: 2, background: '#8b8f98' }} />
        <div style={{ position: 'absolute', left: `${audPct}%`, top: 20, bottom: 14, width: 3, background: '#a068d5' }} />

        {/* Aud 標籤跟 Min/Max 中心距太近(窄螢幕或區間很窄時常見)會疊字,
            太近時把 Aud 標籤上移一截錯開,不是硬擠在同一列。 */}
        <div style={{ position: 'absolute', left: `${minPct}%`, top: 12, transform: 'translateX(-50%)', fontSize: 10.5, fontWeight: 600, color: '#e5a0a0', whiteSpace: 'nowrap', textAlign: 'center' }}>Min ＝ Unity<br />{fmt(rangeMinM)} m</div>
        <div style={{ position: 'absolute', left: `${audPct}%`, top: Math.abs(audPct - minPct) < 18 || (Number.isFinite(maxPct) && Math.abs(audPct - maxPct) < 18) ? -24 : 0, transform: 'translateX(-50%)', fontSize: 11.5, fontWeight: 700, color: '#c39ae8', whiteSpace: 'nowrap', textAlign: 'center' }}>觀眾席 Aud<br />{fmt(audienceDistM)} m</div>
        {Number.isFinite(maxPct) && (
          <div style={{ position: 'absolute', left: `${maxPct}%`, top: 12, transform: 'translateX(-50%)', fontSize: 10.5, fontWeight: 600, color: '#e5a0a0', whiteSpace: 'nowrap', textAlign: 'center' }}>Max<br />{fmt(finiteMax)} m</div>
        )}
        <div style={{ position: 'absolute', left: `${limitPct}%`, top: 72, transform: 'translateX(-50%)', fontSize: 10.5, fontWeight: 600, color: '#b8b8bb', whiteSpace: 'nowrap' }}>Limit {fmt(limitDepthM)} m</div>
        <div style={{ position: 'absolute', left: 0, top: 72, fontSize: 10.5, color: 'var(--nm-text-faint)' }}>0 m(陣列)</div>
        {/* Limit 標籤靠右端時會跟軸尾的「chartMax m」文字疊字,太近就不畫軸尾文字——
            Limit 標籤本身已經標出深度數值,不會少一個數字。 */}
        {limitPct < 80 && <div style={{ position: 'absolute', right: 0, top: 72, fontSize: 10.5, color: 'var(--nm-text-faint)' }}>{fmt(chartMaxM, 0)} m</div>}
      </div>

      <div className="text-[11.5px] leading-[1.7] mt-3.5" style={{ color: 'var(--nm-text-muted)' }}>
        綠帶＝好聲音深度區間({fmt(rangeMinM)}–{fmt(finiteMax)} m)。名詞直接標在軸上,原本 5 條圖例文字改成{' '}
        <button type="button" onClick={() => setLegendOpen((v) => !v)} className="underline" style={{ color: 'var(--nm-text-secondary)' }}>
          「圖例說明 {legendOpen ? '▴' : '▾'}」
        </button>
        {' '}收起來。
      </div>
      {legendOpen && (
        <div className="mt-3">
          <Legend />
        </div>
      )}
    </div>
  );
}
