import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const envText = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const env = {};
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data, error } = await sb.from('users').select('id, name, line_user_id').limit(3);
if (error) {
  console.log('❌', error.message);
  process.exit(0);
}
console.log('✅ users.line_user_id 欄位存在:', data);

const { error: codeErr } = await sb.from('line_bind_codes').select('code').limit(1);
console.log('line_bind_codes 表存在:', !codeErr, codeErr?.message ?? '');
