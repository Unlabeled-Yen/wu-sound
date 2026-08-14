const fmt = (n: number) => n.toLocaleString('zh-TW');
const signed = (n: number) => (n >= 0 ? `＋$${fmt(n)}` : `$${fmt(n)}`);

// 淨額帶:數值與間距直接照抄原型 7a 的 inline style(見 design handoff 00 文件)——
// 帳面淨額／實收實付淨額並排,差距是第三欄裡的一行字(不是獨立大數字)，配一條
// 雙段空心條拆解應收未收(黃)／應付未付(紅)，兩段都是「空心描邊+同色 14% 底色」，
// 不是純色深淺、也不是斜紋。
export function NetBand({
  netFace, netSettled, incomeUnsettled, expenseUnsettled,
}: {
  netFace: number;
  netSettled: number;
  incomeUnsettled: number;
  expenseUnsettled: number;
}) {
  const gap = netFace - netSettled;
  const gapBasis = incomeUnsettled + expenseUnsettled;
  const receivablePct = gapBasis > 0 ? (incomeUnsettled / gapBasis) * 100 : 0;
  const payablePct = gapBasis > 0 ? (expenseUnsettled / gapBasis) * 100 : 0;

  return (
    // 規格明講是「上下各一條 hair 線,內容平鋪」,不是卡片——不要包 nm-raised 背景/圓角。
    <div
      className="flex flex-wrap items-start gap-12"
      style={{ padding: '26px 0 28px', borderTop: '1px solid var(--nm-border-hair)', borderBottom: '1px solid var(--nm-border-hair)' }}
    >
      <div>
        <div className="text-[13px] mb-3.5" style={{ color: 'var(--nm-text-muted)' }}>帳面淨額</div>
        <div
          className="tabular-nums"
          style={{ fontSize: 34, fontWeight: 600, lineHeight: 1, color: 'var(--nm-success)', textShadow: '0 1px 3px rgba(0,0,0,.65)' }}
        >
          {signed(netFace)}
        </div>
      </div>
      <div>
        <div className="text-[13px] mb-3.5" style={{ color: 'var(--nm-text-muted)' }}>實收實付淨額</div>
        <div
          className="tabular-nums"
          style={{ fontSize: 34, fontWeight: 600, lineHeight: 1, color: 'var(--nm-success-glass-text)', textShadow: '0 1px 3px rgba(0,0,0,.65)' }}
        >
          {signed(netSettled)}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 280, maxWidth: 400 }}>
        <div className="text-[13px] mb-3" style={{ color: 'var(--nm-warning-glass-text)' }}>
          {gap >= 0 ? '還沒進帳的差距' : '實收超過帳面的差距'}　${fmt(Math.abs(gap))}
        </div>
        {gapBasis > 0 && (
          <div className="flex mb-3" style={{ gap: 4, height: 14 }}>
            {incomeUnsettled > 0 && (
              <div
                style={{ width: `${receivablePct}%`, borderRadius: 3, border: '1.5px solid var(--nm-warning)', background: 'rgba(217,181,107,.14)' }}
                title={`應收未收 $${fmt(incomeUnsettled)}`}
              />
            )}
            {expenseUnsettled > 0 && (
              <div
                style={{ width: `${payablePct}%`, borderRadius: 3, border: '1.5px solid var(--nm-danger)', background: 'rgba(224,122,122,.14)' }}
                title={`應付未付 $${fmt(expenseUnsettled)}`}
              />
            )}
          </div>
        )}
        <div className="text-[12.5px] leading-[1.75]" style={{ color: 'var(--nm-text-secondary)' }}>
          應收未收 ${fmt(incomeUnsettled)} · 應付未付 ${fmt(expenseUnsettled)}(空心＝錢還沒動,分開計算)
        </div>
      </div>
    </div>
  );
}
