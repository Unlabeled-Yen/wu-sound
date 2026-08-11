import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const envText = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const env = {};
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: existing } = await sb.from('sites').select('id, name').eq('name', '__voice_lab_test__').maybeSingle();
if (existing) {
  console.log('已存在測試 site:', existing.id);
  process.exit(0);
}

const { data, error } = await sb.from('sites').insert({ name: '__voice_lab_test__', active: true }).select('id').single();
if (error) { console.error('建立失敗:', error.message); process.exit(1); }
console.log('已建立測試 site:', data.id);
