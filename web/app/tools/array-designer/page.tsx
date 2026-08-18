import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// 陣列設計器已併入 /tools/acoustic(16-acoustic-merged.md)。舊路由保留純
// redirect,並轉送 ?speaker=&throw= 跨工具交接參數,讓既有深層連結不失效。
export default async function ArrayDesignerPage({ searchParams }: { searchParams: Promise<{ speaker?: string; throw?: string }> }) {
  const sp = (await searchParams) ?? {};
  const params = new URLSearchParams();
  if (sp.speaker) params.set('speaker', sp.speaker);
  if (sp.throw) params.set('throw', sp.throw);
  const qs = params.toString();
  redirect(qs ? `/tools/acoustic?${qs}` : '/tools/acoustic');
}
