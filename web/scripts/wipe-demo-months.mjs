#!/usr/bin/env node
// 清除 seed-demo-months.mjs 寫進去的所有 demo 資料。
// 依 [DEMO] memo 前綴與 " (DEMO)" 名稱後綴刪除,不會碰到真實帳目,
// 也不會碰到 [7月樣本] 那批(兩批標記刻意分開)。
//
// 用法:
//   node --env-file=.env.local scripts/wipe-demo-months.mjs --dry-run
//   node --env-file=.env.local scripts/wipe-demo-months.mjs

import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry-run');
const MEMO_PREFIX = '[DEMO]';
const SUFFIX = ' (DEMO)';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

console.log(DRY ? '=== DRY RUN(只查不刪)===\n' : '=== 開始清除 ===\n');

// 1. 帳目
const le = await sb.from('ledger_entries').select('id').like('memo', `${MEMO_PREFIX}%`);
if (le.error) { console.error(`查帳目失敗: ${le.error.message}`); process.exit(1); }
console.log(`帳目 ${le.data.length} 筆`);
if (!DRY && le.data.length > 0) {
  const del = await sb.from('ledger_entries').delete().like('memo', `${MEMO_PREFIX}%`);
  if (del.error) { console.error(`  ✗ ${del.error.message}`); process.exit(1); }
  console.log('  ✓ 已刪除');
}

// 2. 應收應付
const rc = await sb.from('receivables').select('id').like('memo', `${MEMO_PREFIX}%`);
if (rc.error) { console.error(`查應收應付失敗: ${rc.error.message}`); process.exit(1); }
console.log(`應收應付 ${rc.data.length} 筆`);
if (!DRY && rc.data.length > 0) {
  const del = await sb.from('receivables').delete().like('memo', `${MEMO_PREFIX}%`);
  if (del.error) { console.error(`  ✗ ${del.error.message}`); process.exit(1); }
  console.log('  ✓ 已刪除');
}

// 3. 案場(要先確認沒有其他非 demo 資料掛著,避免誤刪真實關聯)
const st = await sb.from('sites').select('id, name').like('name', `%${SUFFIX}`);
if (st.error) { console.error(`查案場失敗: ${st.error.message}`); process.exit(1); }
console.log(`案場 ${st.data.length} 個`);
if (!DRY) {
  for (const s of st.data) {
    const [le2, rc2, eq, wl] = await Promise.all([
      sb.from('ledger_entries').select('id', { count: 'exact', head: true }).eq('site_id', s.id),
      sb.from('receivables').select('id', { count: 'exact', head: true }).eq('site_id', s.id),
      sb.from('equipment').select('id', { count: 'exact', head: true }).eq('current_site_id', s.id),
      sb.from('worklogs').select('id', { count: 'exact', head: true }).eq('site_id', s.id),
    ]);
    const refs = (le2.count ?? 0) + (rc2.count ?? 0) + (eq.count ?? 0) + (wl.count ?? 0);
    if (refs > 0) { console.log(`  ⚠ 略過「${s.name}」:還有 ${refs} 筆資料掛著`); continue; }
    const del = await sb.from('sites').delete().eq('id', s.id);
    if (del.error) { console.log(`  ⚠ 略過「${s.name}」:${del.error.message}`); continue; }
    console.log(`  ✓ ${s.name}`);
  }
}

// 4. 類別
const ct = await sb.from('site_categories').select('id, name').like('name', `%${SUFFIX}`);
if (ct.error) { console.error(`查類別失敗: ${ct.error.message}`); process.exit(1); }
console.log(`類別 ${ct.data.length} 個`);
if (!DRY) {
  for (const c of ct.data) {
    const used = await sb.from('sites').select('id', { count: 'exact', head: true }).eq('category_id', c.id);
    if ((used.count ?? 0) > 0) { console.log(`  ⚠ 略過「${c.name}」:還有 ${used.count} 個案場在用它`); continue; }
    const del = await sb.from('site_categories').delete().eq('id', c.id);
    if (del.error) { console.log(`  ⚠ 略過「${c.name}」:${del.error.message}`); continue; }
    console.log(`  ✓ ${c.name}`);
  }
}

console.log(DRY ? '\n=== DRY RUN 結束,沒有刪除任何東西 ===' : '\n=== 清除完成 ===');
