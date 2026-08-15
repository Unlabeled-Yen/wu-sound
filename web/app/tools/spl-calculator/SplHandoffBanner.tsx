import Link from 'next/link';

// 算完距離,下一步通常是排幾支——把喇叭與建議距離帶進陣列設計器,不用重填規格。
// 兩支工具原本不共享狀態,這裡用 URL query string 傳遞(?speaker=<id>&throw=<m>),
// 陣列設計器讀到就預填 Auto Mode 的喇叭與觀眾席距離欄位,使用者仍可再手動調整。
export function SplHandoffBanner({ speakerId, recommendedM }: { speakerId: string; recommendedM: number | null }) {
  const params = new URLSearchParams();
  if (speakerId) params.set('speaker', speakerId);
  if (recommendedM !== null && Number.isFinite(recommendedM)) params.set('throw', recommendedM.toFixed(1));
  const href = params.toString() ? `/tools/array-designer?${params.toString()}` : '/tools/array-designer';

  return (
    <div className="flex items-center gap-3.5 rounded-[20px] nm-raised" style={{ padding: '16px 20px' }}>
      <div className="flex-1 text-[12.5px] leading-[1.75]" style={{ color: 'var(--nm-text-secondary)' }}>
        算完的下一步就是排幾支:把這支喇叭與{recommendedM !== null ? ` ${recommendedM.toFixed(1)} m ` : '建議距離'}帶進陣列設計器,不用重填規格。
      </div>
      <Link href={href} className="nm-btn-solid text-[13px] shrink-0">帶入陣列設計器 →</Link>
    </div>
  );
}
