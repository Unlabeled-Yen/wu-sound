const fmt = (n: number) => n.toLocaleString('zh-TW');

// 淨額帶:帳面淨額／實收實付淨額並排常駐,差距獨立成第三個數字——不是要使用者
// 自己心算兩者相減。差距的雙段空心條把「為什麼有差距」拆成應收未收／應付未付,
// 兩段皆為空心描邊(幾何編碼:空心＝錢還沒動),不是實色深淺,也不是斜紋。
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
    <div
      className="rounded-2xl nm-raised-sm px-6 py-6 grid grid-cols-1 md:grid-cols-3 gap-6"
      style={{ borderTop: '1px solid var(--nm-border-hair)', borderBottom: '1px solid var(--nm-border-hair)' }}
    >
      <div>
        <div className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>帳面淨額(含未收未付)</div>
        <div
          className="mt-1.5 tabular-nums"
          style={{ fontSize: 34, fontWeight: 600, color: 'var(--nm-success)', textShadow: '0 1px 3px rgba(0,0,0,.65)' }}
        >
          ${fmt(netFace)}
        </div>
      </div>
      <div>
        <div className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>實收實付淨額(已扣手續費)</div>
        <div
          className="mt-1.5 tabular-nums"
          style={{ fontSize: 34, fontWeight: 600, color: 'var(--nm-success-glass-text)', textShadow: '0 1px 3px rgba(0,0,0,.65)' }}
        >
          ${fmt(netSettled)}
        </div>
      </div>
      <div>
        <div className="text-[12px]" style={{ color: 'var(--nm-warning)' }}>帳面與實收的差距</div>
        <div
          className="mt-1.5 tabular-nums"
          style={{ fontSize: 22, fontWeight: 600, color: 'var(--nm-warning-glass-text)', textShadow: '0 1px 3px rgba(0,0,0,.65)' }}
        >
          ${fmt(Math.abs(gap))}
        </div>
        {/* 兩段都走黃色(未結/待動)——這裡談的是「錢還沒動」,不是收入/支出的方向色,
            紅色留給超收超付/作廢等真正的錯誤狀態。順序(應收在前)＋下方文字負責分辨兩段。 */}
        {gapBasis > 0 && (
          <div className="flex h-3.5 rounded-full overflow-hidden mt-2" style={{ background: 'rgba(255,255,255,0.06)', gap: 2 }}>
            {incomeUnsettled > 0 && (
              <div
                className="rounded-sm"
                style={{ width: `${receivablePct}%`, border: '2px solid var(--nm-warning)', background: 'transparent' }}
                title={`應收未收 $${fmt(incomeUnsettled)}`}
              />
            )}
            {expenseUnsettled > 0 && (
              <div
                className="rounded-sm"
                style={{ width: `${payablePct}%`, border: '2px solid var(--nm-warning)', background: 'rgba(217,181,107,0.14)' }}
                title={`應付未付 $${fmt(expenseUnsettled)}`}
              />
            )}
          </div>
        )}
        <div className="text-[12.5px] mt-1.5" style={{ color: 'var(--nm-text-secondary)' }}>
          應收未收 ${fmt(incomeUnsettled)} · 應付未付 ${fmt(expenseUnsettled)}(空心＝錢還沒動,分開計算)
        </div>
      </div>
    </div>
  );
}
