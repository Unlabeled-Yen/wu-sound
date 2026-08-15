import Link from 'next/link';

const fmt = (n: number) => n.toLocaleString('zh-TW');

export interface RankRow { key: string; label: string; amount: number }

export function rankTop3(map: Map<string, { label: string; amount: number }>): RankRow[] {
  const arr = Array.from(map.entries())
    .map(([key, v]) => ({ key, ...v }))
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  if (arr.length <= 3) return arr;
  const rest = arr.slice(3).reduce((s, r) => s + r.amount, 0);
  return [...arr.slice(0, 3), { key: '__other__', label: '其他', amount: rest }];
}

// 收支欄首統計:兩欄固定同高,不隨排行筆數多寡變動——切篩選時版面不跳動。
// 比例條只回答「這一欄自己的已收/未收各佔多少」,右上角明寫基準,禁止跨欄比長度。
// 未收/未付段用空心描邊(幾何編碼)取代原本的斜紋——使用者明確否決斜紋。
export function ColumnHeader({
  label, faceAmount, settledAmount, unsettledAmount, settledLabel, unsettledLabel, tone,
  settledHref, unsettledHref, ranking, rankingHrefFor,
}: {
  label: string;
  faceAmount: number;
  settledAmount: number;
  unsettledAmount: number;
  settledLabel: string;
  unsettledLabel: string;
  tone: 'income' | 'expense';
  settledHref: string;
  unsettledHref: string;
  ranking: RankRow[];
  rankingHrefFor: (key: string) => string;
}) {
  const toneColor = tone === 'income' ? 'var(--nm-success-glass-text)' : 'var(--nm-danger-glass-text)';
  const total = settledAmount + unsettledAmount;
  const settledPct = total > 0 ? (settledAmount / total) * 100 : 100;
  const maxRank = Math.max(1, ...ranking.map((r) => r.amount));

  return (
    <div className="rounded-2xl nm-raised p-4 flex flex-col" style={{ height: 260 }}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>帳面{label}</div>
          <div className="text-2xl font-semibold mt-1 tabular-nums" style={{ color: toneColor }}>${fmt(faceAmount)}</div>
        </div>
        <span className="text-[10.5px] shrink-0 pt-1" style={{ color: 'var(--nm-text-faint)' }}>比例以本欄自身 100% 計</span>
      </div>

      {/* 幾何編碼:實心＝已收付,空心描邊塊＝未收未付,邊界硬切,不用斜紋、不只靠顏色。 */}
      <div className="mt-3">
        <div className="flex h-2.5 overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 3, gap: settledAmount > 0 && unsettledAmount > 0 ? 2 : 0 }}>
          {settledAmount > 0 && <div style={{ width: `${settledPct}%`, borderRadius: 3, background: toneColor }} />}
          {unsettledAmount > 0 && (
            <div style={{ width: `${100 - settledPct}%`, borderRadius: 3, border: `2px solid ${toneColor}`, background: 'transparent' }} />
          )}
        </div>
        <div className="flex justify-between text-[11px] leading-none tracking-[.14em] mt-1.5">
          <Link href={settledHref} className="underline tabular-nums" style={{ color: 'var(--nm-text-secondary)' }}>{settledLabel} ${fmt(settledAmount)}</Link>
          <Link href={unsettledHref} className="underline tabular-nums" style={{ color: 'var(--nm-text-secondary)' }}>{unsettledLabel} ${fmt(unsettledAmount)}</Link>
        </div>
      </div>

      {ranking.length > 0 && (
        <div className="space-y-1.5 mt-3 pt-1 flex-1 min-h-0 overflow-y-auto">
          {ranking.map((r) => {
            const barPct = (r.amount / maxRank) * 100;
            const content = (
              <div className="flex items-center gap-2 text-[11px] leading-none tracking-[.14em]">
                <span className="truncate w-16 shrink-0" style={{ color: 'var(--nm-text-secondary)' }}>{r.label}</span>
                <span className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <span className="block h-full rounded-full" style={{ width: `${barPct}%`, background: toneColor }} />
                </span>
                <span className="tabular-nums shrink-0" style={{ color: 'var(--nm-text-body)' }}>${fmt(r.amount)}</span>
              </div>
            );
            return r.key === '__other__' ? (
              <div key={r.key}>{content}</div>
            ) : (
              <Link key={r.key} href={rankingHrefFor(r.key)} className="block hover:opacity-80 transition-opacity">{content}</Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
