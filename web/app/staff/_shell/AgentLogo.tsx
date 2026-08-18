'use client';

// 員工手機首頁 AI 入口:logo 本體就是狀態指示器,也是唯一的啟動/結束控制項
// (點擊切換,不是按住講話)。規格見 voice-lab/lab4-mobile-agent-entry-brief-v1.md。
//
// 純視覺元件——狀態由外部 prop 驅動,這支檔案不知道語音/agent 邏輯,也不接
// 麥克風。Lab 3 語音後端就緒前,呼叫端只能用假狀態測試這個元件本身。

export type AgentState = 'idle' | 'listening' | 'thinking' | 'responding' | 'executing';

const STATE_LABEL: Record<AgentState, string> = {
  idle: '輕點 logo 開始',
  listening: '聽你說…',
  thinking: '整理中…',
  responding: '回覆中',
  executing: '執行中',
};

export function AgentLogo({
  state,
  onToggle,
  label,
}: {
  state: AgentState;
  onToggle: () => void;
  /** 覆寫狀態文字,例如 executing 時顯示「執行中：建立任務」。不傳則用預設文字。 */
  label?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-4">
      <img
        src="/brand/mark.png"
        alt=""
        aria-hidden="true"
        role="button"
        aria-label={state === 'idle' ? '開始語音助理' : '結束語音助理'}
        data-state={state}
        className="agent-logo"
        onClick={onToggle}
      />
      <div className="text-[13px]" style={{ color: 'var(--nm-text-muted)' }}>
        {label ?? STATE_LABEL[state]}
      </div>
    </div>
  );
}
