import type { PlacebookData } from '@/lib/placebook-data';
import { PlacebookBoard } from './PlacebookBoard';

// 地點簿(design_handoff_wu_sound/15-placebook.md)首頁本體。資料在 page.tsx
// 抓好(標題列的摘要句也要用同一份數字,所以提高一層抓),這裡只負責讀取失敗
// 的錯誤畫面,互動(搜尋/展開)交給 client 的 PlacebookBoard。
export function PlacebookView({ data }: { data: PlacebookData }) {
  if (data.error) {
    return (
      <div
        className="rounded-xl p-3 text-[13px]"
        style={{ background: 'rgba(224, 122, 122, 0.08)', border: '1px solid rgba(224, 122, 122, 0.34)', color: 'var(--nm-danger-glass-text)' }}
      >
        讀取失敗:{data.error}
      </div>
    );
  }

  return <PlacebookBoard data={data} />;
}
