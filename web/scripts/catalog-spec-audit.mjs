import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const envText = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const env = {};
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data, error } = await sb
  .from('catalog_items')
  .select('id, brand, name, item_type, category, unit, max_spl_db, sensitivity_db_1w1m, amp_power_w')
  .eq('active', true)
  .order('category')
  .order('brand')
  .order('name');

if (error) { console.error(error); process.exit(1); }

// 依 category 分組
const byCat = new Map();
for (const r of data) {
  const c = r.category ?? '(未分類)';
  if (!byCat.has(c)) byCat.set(c, []);
  byCat.get(c).push(r);
}

console.log(`總計 ${data.length} 個啟用中的品項\n`);
for (const [cat, items] of byCat) {
  console.log(`==== ${cat} (${items.length}) ====`);
  for (const r of items) {
    const marks = [];
    if (r.max_spl_db != null) marks.push('SPL');
    if (r.sensitivity_db_1w1m != null) marks.push('SENS');
    if (r.amp_power_w != null) marks.push('AMP');
    const marker = marks.length ? ' ✓' + marks.join('/') : '';
    console.log(`  [${r.brand ?? '?'}] ${r.name} · ${r.item_type ?? ''} · ${r.unit}${marker}`);
  }
  console.log('');
}
