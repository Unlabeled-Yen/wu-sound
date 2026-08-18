import { redirect } from 'next/navigation';

// 落地頁跟老闆一致,一律 /boss(見 app/page.tsx 同名註解)。/staff/capture
// 等子路由沒刪,只是不再是預設入口——直接連結還是進得去。
export default function StaffIndex() {
  redirect('/boss');
}
