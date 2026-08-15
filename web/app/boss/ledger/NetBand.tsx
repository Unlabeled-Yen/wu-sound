const fmt = (n: number) => n.toLocaleString('zh-TW');
const signed = (n: number) => (n >= 0 ? `＋$${fmt(n)}` : `$${fmt(n)}`);

// 淨額帶 v2(design_handoff_wu_sound/10-netband.md,定案 2026-08-15)。
// 取代舊版「應收未收／應付未付並排雙段條」——那個形狀暗示兩者相加＝差距,
// 實際關係是相減(帳面淨額 − 應收款 + 應付款 = 實收實付淨額),形狀在騙人。
// 改成單一連續成分條:已收(實色)／應收款／應付款(淡色底＋同色頂線),
// 段寬一律 value/denominator 算,不得硬編碼百分比。
//
// props 沿用舊版(netFace/netSettled/incomeUnsettled/expenseUnsettled),
// 呼叫端不用改。容器是平鋪,上下各一條 hair 線,不是卡片,不包 nm-raised。
export function NetBand({
  netFace, netSettled, incomeUnsettled, expenseUnsettled,
}: {
  netFace: number;
  netSettled: number;
  incomeUnsettled: number;
  expenseUnsettled: number;
}) {
  const gap = netFace - netSettled;
  const denominator = netSettled + incomeUnsettled + expenseUnsettled;
  const receivablePayableDiff = incomeUnsettled - expenseUnsettled;
  const residual = gap - receivablePayableDiff;

  const segments = [
    { key: 'settled', label: '已收', value: netSettled, background: 'rgba(126,207,157,.55)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.1)', valueColor: 'var(--nm-success-glass-text)' },
    { key: 'receivable', label: '應收款', value: incomeUnsettled, background: 'rgba(217,181,107,.16)', borderTop: '1.5px solid var(--nm-warning)', valueColor: 'var(--nm-warning-glass-text)' },
    { key: 'payable', label: '應付款', value: expenseUnsettled, background: 'rgba(224,122,122,.16)', borderTop: '1.5px solid var(--nm-danger)', valueColor: 'var(--nm-danger-glass-text)' },
  ].filter((s) => s.value > 0);

  return (
    <div
      className="flex flex-wrap gap-10"
      style={{ padding: '26px 32px 28px', borderTop: '1px solid var(--nm-border-hair)', borderBottom: '1px solid var(--nm-border-hair)', alignItems: 'flex-start' }}
    >
      {/* 左欄:實收實付淨額(主數字)＋帳面淨額／未實現淨額(副數字) */}
      <div style={{ flex: 'none', width: 236 }}>
        <div className="text-[13px] leading-none mb-3.5" style={{ color: 'var(--nm-text-muted)' }}>實收實付淨額</div>
        <div
          className="tabular-nums mb-2.5"
          style={{ fontSize: 34, fontWeight: 600, lineHeight: 1, letterSpacing: '-.01em', color: 'var(--nm-success-glass-text)', textShadow: '0 1px 3px rgba(0,0,0,.65)' }}
        >
          {signed(netSettled)}
        </div>
        <div className="text-[11.5px] leading-[1.65]" style={{ color: 'var(--nm-text-faint)' }}>真的在帳戶裡、可以動用的錢</div>

        <div className="flex gap-6" style={{ marginTop: 18, paddingTop: 15, borderTop: '1px solid var(--nm-border-hair)' }}>
          <div>
            <div className="text-[12px] leading-none mb-2.5" style={{ color: 'var(--nm-text-muted)' }}>帳面淨額</div>
            <div className="tabular-nums" style={{ fontSize: 18, fontWeight: 500, lineHeight: 1, color: 'var(--nm-success)' }}>{signed(netFace)}</div>
          </div>
          <div>
            <div className="text-[12px] leading-none mb-2.5" style={{ color: 'var(--nm-text-muted)' }}>{gap >= 0 ? '未實現淨額' : '已實現超出'}</div>
            <div className="tabular-nums" style={{ fontSize: 18, fontWeight: 500, lineHeight: 1, color: 'var(--nm-warning-glass-text)' }}>{signed(gap)}</div>
          </div>
        </div>
      </div>

      {/* 中欄:單一連續成分條(已收／應收款／應付款) */}
      {denominator > 0 && (
        <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
          <div className="flex items-baseline justify-between mb-3.5">
            <span className="text-[13px] leading-none" style={{ color: 'var(--nm-text-muted)' }}>已成立的錢，各佔多少</span>
            <span className="text-[12px] leading-none tabular-nums" style={{ color: 'var(--nm-text-faint)' }}>
              整條＝${fmt(denominator)}（已收＋應收款＋應付款）
            </span>
          </div>

          <div
            data-netband-track
            className="flex mb-2.5"
            style={{ height: 32, borderRadius: 3, border: '1px solid rgba(255,255,255,.22)', overflow: 'hidden' }}
          >
            {segments.map((s, i) => (
              <div
                key={s.key}
                data-netband-seg={s.key}
                data-value={s.value}
                style={{
                  width: `${(s.value / denominator) * 100}%`,
                  background: s.background,
                  boxShadow: s.boxShadow,
                  borderTop: s.borderTop,
                  borderRight: i < segments.length - 1 ? '1px solid rgba(11,11,13,.9)' : undefined,
                }}
              />
            ))}
          </div>

          <div className="flex mb-4 text-[11px] leading-none tabular-nums" style={{ color: 'var(--nm-text-secondary)' }}>
            {segments.map((s) => (
              <span key={s.key} style={{ width: `${(s.value / denominator) * 100}%` }}>
                {((s.value / denominator) * 100).toFixed(1)}%
              </span>
            ))}
          </div>

          <div className="text-[11.5px] leading-[1.65]" style={{ color: 'var(--nm-text-faint)' }}>
            實色＝錢已經動了　·　淡色底＋頂線＝還沒動。三段同一條軸，長度可直接互比。
          </div>
        </div>
      )}

      {/* 右欄:金額圖例＋對帳殘差 */}
      {denominator > 0 && (
        <div style={{ flex: 'none', width: 262, borderLeft: '1px solid var(--nm-border-hair)', paddingLeft: 24 }}>
          <div className="text-[10.5px] leading-none mb-3.5" style={{ color: 'var(--nm-text-muted)', letterSpacing: '.16em', textTransform: 'uppercase' }}>金額</div>
          <div className="flex flex-col">
            {segments.map((s, i) => (
              <div
                key={s.key}
                className="flex items-center gap-2.5"
                style={{ padding: '9px 0', borderBottom: i < segments.length - 1 ? '1px solid rgba(255,255,255,.06)' : undefined }}
              >
                <span style={{ flex: 'none', width: 11, height: 11, borderRadius: 2, background: s.background, borderTop: s.borderTop, display: 'block' }} />
                <span className="flex-1 text-[12.5px] leading-none" style={{ color: 'var(--nm-text-body)' }}>{s.label}</span>
                <span className="tabular-nums text-[13px] leading-none font-medium" style={{ color: s.valueColor }}>${fmt(s.value)}</span>
              </div>
            ))}
          </div>

          {Math.abs(residual) >= 1 && (
            <div className="text-[11.5px] leading-[1.65]" style={{ marginTop: 11, paddingTop: 11, borderTop: '1px solid var(--nm-border-hair)', color: 'var(--nm-text-faint)' }}>
              應收款 − 應付款 ＝ <span className="tabular-nums" style={{ color: 'var(--nm-text-secondary)' }}>{signed(receivablePayableDiff)}</span>
              <br />
              與未實現淨額差 <span className="tabular-nums" style={{ color: 'var(--nm-warning-glass-text)' }}>${fmt(Math.abs(residual))}</span>
              {'　'}
              <span className="underline" style={{ color: 'var(--nm-text-secondary)' }}>查</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
