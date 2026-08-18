import { redirect } from 'next/navigation';
import { taipeiCurrentMonthStr } from '@/lib/tz';
import { requirePageCapability } from '@/lib/require-capability';

export const dynamic = 'force-dynamic';

// 月結改版(docs/payroll-pettycash-merge-spec.md):零用金管理+薪資結算併進
// 帳務管理的「月結」模式,舊路徑/舊書籤轉址過去,月份參數一併帶過去。
export default async function BossClosePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  await requirePageCapability('finance');
  const sp = await searchParams;
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : taipeiCurrentMonthStr();
  redirect(`/boss/ledger?mode=payroll&month=${month}`);
}
