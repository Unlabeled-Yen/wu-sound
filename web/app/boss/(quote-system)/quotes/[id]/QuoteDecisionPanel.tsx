'use client';

import { useState } from 'react';
import { QUOTE_STATUS_LABEL, QUOTE_STATUS_TRANSITIONS, type QuoteStatus } from '@/lib/types';
import { QUOTE_STATUS_PILL_CLASS, QUOTE_STATUS_PILL_STYLE } from '../../quote-status-style';

const fmt = (n: number) => n.toLocaleString('zh-TW');

export interface FirstMissing {
  sectionLabel: string;
  rowNumber: number;
  lineId: string;
}

// 決策欄:狀態／小計／總價／阻擋原因／動作全部常駐在這裡,sticky 在文件旁邊——
// 工作記憶容量有限,使用者不必往下捲、記住小計再心算。阻擋訊息只出現在這一處
// (原本表尾跟總額區各一次、文案還不一樣)。
export function QuoteDecisionPanel({
  status, onChangeStatus, statusBusy, statusError,
  equipmentSubtotal, installSubtotal, total, taxRate, setTaxRate, onSaveTaxRate, taxBusy,
  tax, grandTotal, missing, firstMissing, onJumpToMissing, canSend, onSend, sendBusy,
  marginPct, marginTwd, coveredLines, totalLines,
  printHref, csvHref,
}: {
  status: QuoteStatus;
  onChangeStatus: (s: QuoteStatus) => void;
  statusBusy: boolean;
  statusError: string | null;
  equipmentSubtotal: number;
  installSubtotal: number;
  total: number;
  taxRate: string;
  setTaxRate: (v: string) => void;
  onSaveTaxRate: () => void;
  taxBusy: boolean;
  tax: number;
  grandTotal: number;
  missing: number;
  firstMissing: FirstMissing | null;
  onJumpToMissing: () => void;
  canSend: boolean;
  onSend: () => void;
  sendBusy: boolean;
  marginPct: number | null;
  marginTwd: number;
  coveredLines: number;
  totalLines: number;
  printHref: string;
  csvHref: string;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const transitions = QUOTE_STATUS_TRANSITIONS[status];

  return (
    <div className="w-full lg:w-[320px] shrink-0 flex flex-col gap-3.5 print-hide" style={{ position: 'sticky', top: 20, alignSelf: 'flex-start' }}>
      <div className="rounded-[20px] nm-raised-sm p-5.5" style={{ padding: 22 }}>
        <div className="flex items-center justify-between mb-5">
          <span className={`nm-pill ${QUOTE_STATUS_PILL_CLASS[status]}`} style={{ ...QUOTE_STATUS_PILL_STYLE[status], fontSize: 11.5, padding: '4px 11px' }}>
            {QUOTE_STATUS_LABEL[status]}
          </span>
          {transitions.length > 0 ? (
            <select
              value=""
              onChange={(e) => e.target.value && onChangeStatus(e.target.value as QuoteStatus)}
              disabled={statusBusy}
              className="text-[11.5px] bg-transparent outline-none"
              style={{ color: 'var(--nm-text-faint)' }}
            >
              <option value="">狀態可改 ▾</option>
              {transitions.map((s) => <option key={s} value={s}>{QUOTE_STATUS_LABEL[s]}</option>)}
            </select>
          ) : (
            <span className="text-[11.5px]" style={{ color: 'var(--nm-text-faint)' }}>已是終態,不可再變更</span>
          )}
        </div>
        {statusError && <div className="text-[12px] mb-3" style={{ color: 'var(--nm-danger)' }}>{statusError}</div>}

        <div className="grid gap-2.5 text-[12.5px]" style={{ color: 'var(--nm-text-secondary)' }}>
          <div className="flex justify-between"><span>器材</span><span className="tabular-nums" style={{ color: 'var(--nm-text-body)' }}>${fmt(equipmentSubtotal)}</span></div>
          <div className="flex justify-between"><span>安裝</span><span className="tabular-nums" style={{ color: 'var(--nm-text-body)' }}>${fmt(installSubtotal)}</span></div>
          <div className="flex justify-between pt-2.5" style={{ borderTop: '1px solid rgba(255,255,255,.07)' }}><span>小計</span><span className="tabular-nums" style={{ color: 'var(--nm-text-body)' }}>${fmt(total)}</span></div>
          <div className="flex justify-between items-center">
            <span className="flex items-center gap-2">
              稅額
              <input
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                onBlur={onSaveTaxRate}
                disabled={taxBusy}
                className="text-[11.5px] text-right tabular-nums outline-none"
                style={{ minHeight: 28, width: 44, padding: '0 8px', borderRadius: 9, background: 'rgba(8,8,10,.5)', border: '1px solid rgba(255,255,255,.13)', color: 'var(--nm-text-body)' }}
              />
            </span>
            <span className="tabular-nums" style={{ color: 'var(--nm-text-body)' }}>${fmt(tax)}</span>
          </div>
        </div>

        <div className="mt-4.5 pt-4" style={{ marginTop: 18, borderTop: '1px solid rgba(255,255,255,.1)' }}>
          <div className="text-[12px] mb-2.5" style={{ color: 'var(--nm-text-muted)' }}>總價(暫定)</div>
          <div className="text-[32px] font-semibold tabular-nums" style={{ color: 'var(--nm-text-primary)', textShadow: '0 1px 3px rgba(0,0,0,.65)' }}>${fmt(grandTotal)}</div>
        </div>

        {missing > 0 && (
          <button
            type="button"
            onClick={onJumpToMissing}
            className="block w-full text-left mt-4.5 rounded-[13px] px-3.5 py-3"
            style={{ marginTop: 18, background: 'rgba(217,181,107,.08)', border: '1px solid rgba(217,181,107,.28)' }}
          >
            <div className="text-[12.5px] leading-[1.7] font-medium" style={{ color: 'var(--nm-warning-glass-text)' }}>{missing} 項待補價,補完才能送出</div>
            {firstMissing && (
              <div className="text-[11.5px] leading-[1.6] mt-1.5" style={{ color: 'var(--nm-text-secondary)' }}>
                {firstMissing.sectionLabel} · 第 {firstMissing.rowNumber} 行 ›
              </div>
            )}
          </button>
        )}

        {/* 只有 draft 才能轉 sent(QUOTE_STATUS_TRANSITIONS)——其他狀態下這顆鈕
            沒有意義,不要顯示成「可以按但其實會被 API 拒絕」的假可互動狀態。 */}
        <button
          type="button"
          onClick={onSend}
          disabled={status !== 'draft' || !canSend || sendBusy}
          className="w-full mt-4 min-h-[44px] rounded-[13px] text-[13px] font-medium"
          style={
            status === 'draft' && canSend
              ? { background: '#f0f0f2', color: '#17171a' }
              : { background: 'rgba(240,240,242,.35)', color: 'rgba(23,23,26,.75)', cursor: 'not-allowed' }
          }
        >
          {sendBusy ? '送出中…' : status !== 'draft' ? QUOTE_STATUS_LABEL[status] : '送出給客戶'}
        </button>

        <div className="mt-2.5 flex items-center justify-center gap-3.5 text-[12.5px] relative" style={{ color: 'var(--nm-text-secondary)' }}>
          <a href={printHref} target="_blank" rel="noreferrer">預覽客戶版</a>
          <span style={{ width: 1, height: 12, background: 'rgba(255,255,255,.12)' }} />
          <button type="button" onClick={() => setMoreOpen((v) => !v)}>⋯</button>
          {moreOpen && (
            <div className="absolute top-6 right-0 z-20 w-40 rounded-[13px] py-1.5 nm-raised-lg">
              <a href={printHref} target="_blank" rel="noreferrer" className="block px-3 py-1.5 text-[12.5px] text-left" style={{ color: 'var(--nm-text-body)' }}>列印</a>
              <a href={csvHref} className="block px-3 py-1.5 text-[12.5px] text-left" style={{ color: 'var(--nm-text-body)' }}>匯出 CSV</a>
              <a href="/boss/quotes" className="block px-3 py-1.5 text-[12.5px] text-left" style={{ color: 'var(--nm-text-body)' }}>返回列表</a>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-[20px] nm-raised p-5">
        <div className="flex items-center justify-between mb-3.5">
          <div className="text-[13px] font-medium" style={{ color: 'var(--nm-text-body)' }}>毛利(僅內部)</div>
          <div className="text-[17px] font-semibold tabular-nums" style={{ color: 'var(--nm-success-glass-text)' }}>{marginPct !== null ? `${marginPct.toFixed(1)}%` : '—'}</div>
        </div>
        <div className="h-2.5 rounded-[3px] mb-3" style={{ background: 'rgba(255,255,255,.06)', overflow: 'hidden' }}>
          <div style={{ width: `${Math.max(0, Math.min(100, marginPct ?? 0))}%`, height: '100%', background: 'rgba(126,207,157,.75)' }} />
        </div>
        <div className="text-[11.5px] leading-[1.7]" style={{ color: 'var(--nm-text-muted)' }}>
          ${fmt(marginTwd)}　·　僅 {coveredLines}／{totalLines} 項有進價資料,不含人事,不會出現在列印與匯出。
        </div>
      </div>
    </div>
  );
}
