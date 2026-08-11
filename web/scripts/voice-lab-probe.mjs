import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const envText = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const env = {};
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: users, error } = await sb.from('users').select('id, name, role, active').eq('active', true).order('role');
if (error) { console.error('ERROR', error.message); process.exit(1); }
console.log('active users:');
for (const u of users) console.log(`  ${u.role.padEnd(6)} ${u.name.padEnd(12)} ${u.id}`);

const { data: existingTest } = await sb.from('sites').select('id, name, active').ilike('name', '%voice_lab_test%');
console.log('existing test sites:', existingTest);

const { error: tasksErr } = await sb.from('tasks').select('id').limit(1);
console.log('tasks table exists:', !tasksErr, tasksErr?.message ?? '');
const { error: wpErr } = await sb.from('write_proposals').select('token').limit(1);
console.log('write_proposals table exists:', !wpErr, wpErr?.message ?? '');
