'use client';

import { useRef } from 'react';

// AI 助理狀態指示器,也是唯一的語音控制項——不是按鈕加按鈕,是同一顆 logo
// 靠手勢分流(2026-08-18 Yen 定案):
//   點一下  = 切換免手模式(講完自動繼續聽,AI 給出最終答案才自動關)
//   按著不放 = 錄音模式(按多久錄多久,鬆開送出這一句)
// 規格見 voice-lab/lab4-mobile-agent-entry-brief-v1.md。桌面 ⌘K 助理頁的
// 空狀態、手機助理首頁的空狀態與對話中的常駐小圖示共用這支——「同一個 AI,
// 入口不同而已」,視覺元件跟手勢邏輯當然也共用一份,不要各自兜一套。
//
// 純視覺+手勢元件——狀態由外部 prop 驅動,這支檔案不知道語音/agent 邏輯,
// 也不接麥克風,只負責分辨「這是點一下還是按著」再呼叫對應的 callback。

export type AgentState = 'idle' | 'listening' | 'thinking' | 'responding' | 'executing';

const STATE_LABEL: Record<AgentState, string> = {
  idle: '輕點切換免手模式,按著錄一句',
  listening: '聽你說…',
  thinking: '整理中…',
  responding: '回覆中',
  executing: '執行中',
};

/** 按著多久算「長按」而不是「點一下」——快點快放才是切換免手模式 */
const HOLD_THRESHOLD_MS = 320;

export function AgentLogo({
  state,
  onTap,
  onHoldStart,
  onHoldEnd,
  label,
  size = 106,
}: {
  state: AgentState;
  /** 快點快放:切換免手模式 */
  onTap: () => void;
  /** 按滿門檻時觸發一次:開始錄音 */
  onHoldStart: () => void;
  /** 長按放開時觸發:結束錄音、送出 */
  onHoldEnd: () => void;
  /** 覆寫狀態文字,例如 executing 時顯示「執行中：建立任務」。不傳則用預設文字。 */
  label?: string;
  /** 常駐在對話串列裡的小圖示用較小尺寸,空狀態用預設大小 */
  size?: number;
}) {
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holding = useRef(false);

  function clearTimer() {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault();
    holding.current = false;
    clearTimer();
    holdTimer.current = setTimeout(() => {
      holding.current = true;
      onHoldStart();
    }, HOLD_THRESHOLD_MS);
  }

  function onPointerUp() {
    clearTimer();
    if (holding.current) {
      holding.current = false;
      onHoldEnd();
    } else {
      onTap();
    }
  }

  /** 手指滑出按鈕範圍:當作放開,長按中就結束錄音,還沒到門檻就整個取消(不當點一下) */
  function onPointerLeave() {
    clearTimer();
    if (holding.current) {
      holding.current = false;
      onHoldEnd();
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        aria-label="按一下切換免手模式,按著不放錄一句話"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
        onContextMenu={(e) => e.preventDefault()}
        className="bg-transparent border-0 p-0 nm-focus select-none"
        style={{
          borderRadius: '50%',
          touchAction: 'manipulation',
          // iOS Safari 長按圖片會跳出系統的「儲存/拷貝/查詢」選單,搶走我們自己的
          // 長按錄音手勢——這兩個 -webkit 屬性關掉那個系統選單,onContextMenu
          // 擋的是滑鼠右鍵那條路徑,兩者要同時擋才會在真機上都生效。
          WebkitTouchCallout: 'none',
          WebkitUserSelect: 'none',
        }}
      >
        <img
          src="/brand/mark.png"
          alt=""
          aria-hidden="true"
          data-state={state}
          draggable={false}
          className="agent-logo"
          style={{ width: size, height: size, WebkitTouchCallout: 'none', WebkitUserSelect: 'none', pointerEvents: 'none' }}
        />
      </button>
      {label !== '' && (
        <div className="text-[13px] text-center" style={{ color: 'var(--nm-text-muted)' }}>
          {label ?? STATE_LABEL[state]}
        </div>
      )}
    </div>
  );
}
