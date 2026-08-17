import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// SPL 計算器已併入 /tools/acoustic(16-acoustic-merged.md)。舊路由保留純
// redirect,讓既有書籤/深層連結不失效。
export default function SplCalculatorPage() {
  redirect('/tools/acoustic');
}
