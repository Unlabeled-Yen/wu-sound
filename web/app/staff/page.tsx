import { redirect } from 'next/navigation';

// 只有手機版解鎖時,員工才會被送來這裡(見 app/page.tsx 落地頁邏輯)。
// 2026-08-18 Yen 定案:AI 助理聊天頁是員工手機版首頁,零用金/專案備忘/
// 打卡收進聊天頁的抽屜選單——不再是「老闆桌面版沒有的專屬頁面」那個問題
// (手機版鎖著時走 /boss,根本不會到這裡)。
export default function StaffIndex() {
  redirect('/voice-lab-chat?voice=1');
}
