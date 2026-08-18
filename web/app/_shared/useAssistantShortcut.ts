'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * AI 助理是獨立一頁(不是浮動覆蓋層,Yen 2026-08-15 確認的形狀),
 * 快捷鍵的作用是「ERP 任一頁 ↔ 助理頁」來回跳轉,不是開關疊層。
 *
 * ⌘K / Ctrl+K 這個組合借用 SSA handoff(04-ssa-agent.md)的慣例,
 * 平台目前沒有其他功能佔用它。
 *
 * 記「從哪來」用 sessionStorage 而不是瀏覽器上一頁(history.back()):
 * 使用者可能連續按兩次快捷鍵(跳去又跳回),用瀏覽器歷史會越疊越深、
 * 而且分頁重新整理後歷史就斷了;sessionStorage 明確存最後一個 ERP 頁面,
 * 行為可預期。
 *
 * 這支檔案曾經存在過(2026-08-15,commit ff23694),隔天因為要撤銷一個
 * 有問題的帳務首頁改版合併,被連坐一起復原掉、消失在 main 上,不是
 * Yen 推翻這個方向。2026-08-18 復原,順便把目標頁從已經被更完整的
 * Realtime 實作取代的舊技術驗證頁 /voice-live-test,改指向文字模式
 * /voice-lab-chat(Lab 2,測過較多、較穩定;語音模式留給手機那端)。
 */
const ASSISTANT_PATH = '/voice-lab-chat';
const RETURN_KEY = 'assistant:return-to';
const FALLBACK_RETURN = '/boss';

function isShortcut(e: KeyboardEvent): boolean {
  return (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
}

/** 掛在 ERP 各頁(BossShell):按下快捷鍵記住目前頁面,跳去助理頁 */
export function useAssistantLauncher(): void {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!isShortcut(e)) return;
      // 若使用者正在打字(輸入框/文字區/可編輯元素),不要搶走 ⌘K——
      // 有些欄位本來就會用到這個組合(例如搜尋框),不能無條件攔截
      const el = document.activeElement;
      const typing = el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (typing) return;

      e.preventDefault();
      if (pathname && pathname !== ASSISTANT_PATH) {
        sessionStorage.setItem(RETURN_KEY, pathname);
      }
      router.push(ASSISTANT_PATH);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [router, pathname]);
}

/** 掛在助理頁本身:按下快捷鍵跳回剛才記住的 ERP 頁面 */
export function useAssistantReturn(): void {
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!isShortcut(e)) return;
      e.preventDefault();
      const back = sessionStorage.getItem(RETURN_KEY) || FALLBACK_RETURN;
      router.push(back);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [router]);
}

export { ASSISTANT_PATH };
