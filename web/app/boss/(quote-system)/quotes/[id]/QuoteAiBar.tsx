// AI 條:原本自帶一組 rgba(140,120,200) 紫、不在 nm-* 語意內——改用中性玻璃材質,
// 跟表頭/明細列同一份文件語言,不是另一個「AI 專區」卡片。
export function QuoteAiBar({
  needText, setNeedText, onSuggest, busy, error,
  speechSupported, speechOn, onToggleSpeech,
}: {
  needText: string;
  setNeedText: (v: string) => void;
  onSuggest: () => void;
  busy: boolean;
  error: string | null;
  speechSupported: boolean;
  speechOn: boolean;
  onToggleSpeech: () => void;
}) {
  return (
    <div className="print-hide flex items-center gap-3.5" style={{ padding: '16px 26px', borderBottom: '1px solid var(--nm-border-hair)' }}>
      <input
        value={needText}
        onChange={(e) => setNeedText(e.target.value)}
        placeholder="用一句話描述需求,AI 只建議品項與數量,價格一律取自價目表"
        className="flex-1 min-w-0 min-h-[40px] px-3.5 rounded-[13px] text-[13px] outline-none bg-transparent"
        style={{ background: 'rgba(8,8,10,.4)', border: '1px solid rgba(255,255,255,.13)', color: 'var(--nm-text-body)' }}
      />
      {speechSupported && (
        <button
          type="button"
          onClick={onToggleSpeech}
          className="shrink-0 w-11 h-11 rounded-[13px] flex items-center justify-center text-[15px]"
          style={
            speechOn
              ? { background: 'rgba(224,122,122,.14)', border: '1px solid rgba(224,122,122,.4)', color: 'var(--nm-danger-glass-text)' }
              : { background: 'rgba(40,40,46,.4)', border: '1px solid rgba(255,255,255,.2)', color: '#cfcfd2' }
          }
          aria-label="語音輸入"
        >
          ◉
        </button>
      )}
      <button
        type="button"
        onClick={onSuggest}
        disabled={busy}
        className="shrink-0 min-h-[44px] px-4.5 rounded-[13px] text-[13px] disabled:opacity-50"
        style={{ background: 'rgba(40,40,46,.4)', border: '1px solid rgba(255,255,255,.2)', color: '#cfcfd2' }}
      >
        {busy ? 'AI 思考中…' : '請 AI 建議'}
      </button>
      {error && <span className="text-[13px] shrink-0" style={{ color: 'var(--nm-danger)' }}>{error}</span>}
    </div>
  );
}

export function QuoteAiResultBanner({ count, rationale }: { count: number; rationale: string }) {
  if (count <= 0) return null;
  return (
    <div className="print-hide flex items-center gap-2.5 flex-wrap" style={{ padding: '12px 26px', borderBottom: '1px solid var(--nm-border-hair)', background: 'rgba(126,207,157,.05)' }}>
      <span className="shrink-0 px-2.5 py-1 rounded-full text-[11.5px] font-medium" style={{ background: 'rgba(126,207,157,.16)', border: '1px solid rgba(126,207,157,.4)', color: 'var(--nm-success-glass-text)' }}>
        剛加入 {count} 項
      </span>
      {rationale && <span className="text-[12px] leading-[1.6]" style={{ color: 'var(--nm-text-secondary)' }}>AI 配置說明:{rationale}</span>}
    </div>
  );
}
