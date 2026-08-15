import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PayProfile } from './types';

// 生效日期制:取「生效日 ≤ 該月最後一天」裡最新的一筆,當作該月的月薪。
// 改月薪不覆寫舊紀錄,是新增一筆新生效日——歷史月份重算時仍用當時生效的金額。
export function resolveMonthlySalary(
  profiles: PayProfile[],
  userId: string,
  monthEndDate: string,
): number | null {
  const applicable = profiles
    .filter((p) => p.user_id === userId && p.effective_from <= monthEndDate)
    .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1));
  return applicable.length > 0 ? applicable[0].monthly_salary_twd : null;
}

export async function fetchAllPayProfiles(sb: SupabaseClient): Promise<{ rows: PayProfile[]; error: string | null }> {
  const { data, error } = await sb.from('user_pay_profiles').select('*').order('effective_from', { ascending: false });
  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as PayProfile[], error: null };
}
