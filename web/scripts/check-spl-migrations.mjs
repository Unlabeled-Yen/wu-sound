import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const envText = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const env = {};
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// migrations 007/008 加的四個欄位
const { data, error } = await sb
  .from('catalog_items')
  .select('id, name, max_spl_db, spl_ref_distance_m, sensitivity_db_1w1m, amp_power_w')
  .limit(1);

if (error) {
  console.log('❌ 查詢失敗:', error.message);
  if (error.code === 'PGRST205' || /column .* does not exist/i.test(error.message)) {
    console.log('   → migrations 007/008 尚未套用(欄位不存在)');
  }
  process.exit(0);
}

console.log('✅ 查詢成功,欄位存在。範例列:', data[0]);

const { count } = await sb
  .from('catalog_items')
  .select('id', { count: 'exact', head: false })
  .not('max_spl_db', 'is', null);
console.log(`已填 max_spl_db 的品項數:${count ?? 0}`);
