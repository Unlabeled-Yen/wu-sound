import PageTabs from '@/app/_shared/PageTabs';
import { QUOTE_SYSTEM_TABS } from '@/lib/nav';

// 報價系統 = 報價單 + 標配套組 + 價目表。後兩者是報價單的資料來源,
// 側欄只留一列「報價系統」,三頁靠這條分頁列互通。
//
// 這是 Next.js 的路由群組:資料夾名稱帶括號,不會出現在網址裡——三頁的
// 網址(/boss/quotes、/boss/bundles、/boss/catalog)完全沒變,既有連結、
// 書籤、手機「更多」頁都不用改。
export default function QuoteSystemLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* 列印版不顯示分頁列——那頁是要印出來給客戶的 */}
      <PageTabs tabs={QUOTE_SYSTEM_TABS} hideOn={['/print']} />
      {children}
    </>
  );
}
