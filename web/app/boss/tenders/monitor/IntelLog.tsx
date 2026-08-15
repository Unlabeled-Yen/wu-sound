'use client';

// 情資日誌(07-視覺校正指南 §3.4-7)。設計圖右下那塊時間流。
//
// 目前只做「新公告命中」一種事件——資料源就是 /api/tenders/recent 已經回來的
// 命中案,按 publish_date 由新到舊列出來。刻意不做:
//   - 對手動態(需要對手投標歷史 diff)
//   - 規格書更正(需要爬公告 diff)
//   - 越線警報(需要對手殺價門檻設定)
// 上述三種都需要 tender-radar 沒有的資料源,先不做,避免用假資料填版面。

import { useMemo, useState } from 'react';
import { todayInTaipei, isRetender, type TenderHit } from './shared';

interface Props {
  hits: TenderHit[];
}

interface Event {
  id: string;
  timeLabel: string; // 「今」「MM-DD」
  kind: 'hit' | 'retender';
  hit: TenderHit;
}

const DEFAULT_LIMIT = 8;

// 時間標籤:今天顯示「今」,其他顯示 MM-DD——比「N 小時前」誠實
// (publish_date 本來就只有日精度,寫「3 小時前」是假造精度)。
function formatDayLabel(publishDate: string, today: string): string {
  if (publishDate === today) return '今';
  const [, m, d] = publishDate.split('-');
  return `${m}-${d}`;
}

// 一筆 hit 可以同時是「新命中」跟「流標重招」,展開成兩條事件更好讀
// (讀日誌的人在意的是事件類型,不是唯一案號)。
function toEvents(hits: TenderHit[], today: string): Event[] {
  const events: Event[] = [];
  for (const hit of hits) {
    const timeLabel = formatDayLabel(hit.publish_date, today);
    events.push({ id: `hit-${hit.id}`, timeLabel, kind: 'hit', hit });
    if (isRetender(hit)) {
      events.push({ id: `retender-${hit.id}`, timeLabel, kind: 'retender', hit });
    }
  }
  return events;
}

function eventColor(kind: Event['kind']): string {
  switch (kind) {
    case 'retender':
      return 'var(--nm-danger)';
    case 'hit':
      return 'rgba(255,255,255,0.22)';
  }
}

function eventLabel(kind: Event['kind']): string {
  switch (kind) {
    case 'retender':
      return '流標重招';
    case 'hit':
      return '新命中';
  }
}

export default function IntelLog({ hits }: Props) {
  const [expanded, setExpanded] = useState(false);
  const today = todayInTaipei();
  const events = useMemo(() => toEvents(hits, today), [hits, today]);

  if (events.length === 0) {
    return (
      <section className="rounded-2xl nm-raised p-4">
        <h2 className="text-[15px] font-semibold" style={{ color: 'var(--nm-text-primary)' }}>情資日誌</h2>
        <p className="mt-2 text-[12px] leading-[1.6]" style={{ color: 'var(--nm-text-muted)' }}>
          近期沒有可列出的事件。
        </p>
      </section>
    );
  }

  const visible = expanded ? events : events.slice(0, DEFAULT_LIMIT);
  const rest = events.length - visible.length;

  return (
    <section className="rounded-2xl nm-raised p-4">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h2 className="text-[15px] font-semibold" style={{ color: 'var(--nm-text-primary)' }}>情資日誌</h2>
        <span className="text-[11px] leading-none tracking-[.14em]" style={{ color: 'var(--nm-text-faint)' }}>
          近 {hits.length} 件 · {events.length} 則
        </span>
      </div>

      <ul>
        {visible.map((e) => (
          <li key={e.id} className="flex items-start gap-3 py-2" style={{ borderTop: '1px solid var(--nm-border-hair)' }}>
            <span
              className="shrink-0 w-[52px] text-right tabular-nums text-[12px] leading-[1.6]"
              style={{ color: 'var(--nm-text-faint)' }}
            >
              {e.timeLabel}
            </span>
            <span
              className="shrink-0 self-stretch"
              style={{ width: 3, borderRadius: 2, background: eventColor(e.kind) }}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="text-[12px] leading-[1.6]" style={{ color: 'var(--nm-text-secondary)' }}>
                <span
                  className="mr-1.5 text-[11px] tracking-[.14em]"
                  style={{ color: e.kind === 'retender' ? 'var(--nm-danger-glass-text)' : 'var(--nm-text-muted)' }}
                >
                  {eventLabel(e.kind)}
                </span>
                <span style={{ color: 'var(--nm-text-primary)' }}>{e.hit.unit_name || e.hit.unit_id || '未知機關'}</span>
              </div>
              <a
                href={`#tender-${e.hit.id}`}
                className="block text-[12px] leading-[1.6] mt-0.5 hover:underline truncate"
                style={{ color: 'var(--nm-text-body)' }}
              >
                {e.hit.title}
              </a>
            </div>
          </li>
        ))}
      </ul>

      {rest > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-2 w-full text-center text-[12px] leading-[1.6] py-2 rounded-lg nm-lift"
          style={{ color: 'var(--nm-text-faint)' }}
        >
          展開其餘 {rest} 則 ▾
        </button>
      )}

      <p className="mt-3 text-[12px] leading-[1.6]" style={{ color: 'var(--nm-text-muted)' }}>
        目前只列「新公告命中」跟「流標重招」——對手動態、規格更正、越線警報需要
        tender-radar 尚未接上的資料源,先不做。時間精度以公告日為準,不假造小時分鐘。
      </p>
    </section>
  );
}
