#!/usr/bin/env node
// 清除 seed-july-sample.mjs 塞進去的所有測試資料。
// 依 [7月樣本] memo prefix 與 (樣本) 後綴刪除,不會誤刪其他資料。
//
// 用法:
//   node --env-file=.env.local scripts/wipe-july-sample.mjs
//   node --env-file=.env.local scripts/wipe-july-sample.mjs --dry-run
//
// 刪除順序(避開外鍵約束):
//   1. ledger_entries where memo like '[7月樣本]%'
//   2. receivables    where memo like '[7月樣本]%'
//   3. sites          where name like '% (樣本)'  (前提是沒有其他 ledger/quote/equipment 掛在上面)
//   4. site_categories where name like '% (樣本)'

import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry-run');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY,請用 --env-file=.env.local 執行');
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

console.log(DRY ? '=== DRY RUN(不會真的刪)===' : '=== 開始刪除 ===');

// 1. ledger_entries
{
  const cnt = await sb.from('ledger_entries').select('id', { count: 'exact', head: true }).like('memo', '[7月樣本]%');
  if (cnt.error) { console.error(`查詢失敗: ${cnt.error.message}`); process.exit(1); }
  console.log(`帳目: 找到 ${cnt.count ?? 0} 筆帶 [7月樣本] 前綴的紀錄`);
  if (!DRY && (cnt.count ?? 0) > 0) {
    const del = await sb.from('ledger_entries').delete().like('memo', '[7月樣本]%');
    if (del.error) { console.error(`刪除失敗: ${del.error.message}`); process.exit(1); }
    console.log('  ✓ 已刪');
  }
}

// 2. receivables
{
  const cnt = await sb.from('receivables').select('id', { count: 'exact', head: true }).like('memo', '[7月樣本]%');
  if (cnt.error) { console.error(`查詢失敗: ${cnt.error.message}`); process.exit(1); }
  console.log(`應收應付: 找到 ${cnt.count ?? 0} 筆帶 [7月樣本] 前綴的紀錄`);
  if (!DRY && (cnt.count ?? 0) > 0) {
    const del = await sb.from('receivables').delete().like('memo', '[7月樣本]%');
    if (del.error) { console.error(`刪除失敗: ${del.error.message}`); process.exit(1); }
    console.log('  ✓ 已刪');
  }
}

// 3. sites — 先檢查是否被其他資料引用
{
  const list = await sb.from('sites').select('id, name').like('name', '% (樣本)');
  if (list.error) { console.error(`查詢失敗: ${list.error.message}`); process.exit(1); }
  const sites = list.data ?? [];
  console.log(`案場: 找到 ${sites.length} 個帶 (樣本) 後綴的案場`);

  let blocked = 0;
  for (const s of sites) {
    // 檢查是否有非 seed 資料掛在這個案場
    const checks = await Promise.all([
      sb.from('ledger_entries').select('id', { count: 'exact', head: true }).eq('site_id', s.id).not('memo', 'like', '[7月樣本]%'),
      sb.from('receivables').select('id', { count: 'exact', head: true }).eq('site_id', s.id).not('memo', 'like', '[7月樣本]%'),
      sb.from('equipment').select('id', { count: 'exact', head: true }).eq('current_site_id', s.id),
      sb.from('quotes').select('id', { count: 'exact', head: true }).eq('site_id', s.id),
      sb.from('worklogs').select('id', { count: 'exact', head: true }).eq('site_id', s.id),
      sb.from('day_site_allocations').select('id', { count: 'exact', head: true }).eq('site_id', s.id),
    ]);
    const totalRefs = checks.reduce((n, c) => n + (c.count ?? 0), 0);
    if (totalRefs > 0) {
      console.log(`  ⚠ 案場「${s.name}」還有 ${totalRefs} 筆非樣本資料掛在上面,跳過不刪`);
      blocked++;
      continue;
    }
    if (!DRY) {
      const del = await sb.from('sites').delete().eq('id', s.id);
      if (del.error) { console.error(`案場「${s.name}」刪除失敗: ${del.error.message}`); process.exit(1); }
      console.log(`  ✓ 已刪 ${s.name}`);
    } else {
      console.log(`  [DRY] 會刪 ${s.name}`);
    }
  }
  if (blocked > 0) console.log(`  (共 ${blocked} 個案場因有非樣本資料引用而保留)`);
}

// 4. site_categories — 先檢查是否被其他 sites 引用
{
  const list = await sb.from('site_categories').select('id, name').like('name', '% (樣本)');
  if (list.error) { console.error(`查詢失敗: ${list.error.message}`); process.exit(1); }
  const cats = list.data ?? [];
  console.log(`案件類別: 找到 ${cats.length} 個帶 (樣本) 後綴的類別`);

  for (const c of cats) {
    const refs = await sb.from('sites').select('id', { count: 'exact', head: true }).eq('category_id', c.id);
    if ((refs.count ?? 0) > 0) {
      console.log(`  ⚠ 類別「${c.name}」還被 ${refs.count} 個案場引用,跳過`);
      continue;
    }
    if (!DRY) {
      const del = await sb.from('site_categories').delete().eq('id', c.id);
      if (del.error) { console.error(`類別「${c.name}」刪除失敗: ${del.error.message}`); process.exit(1); }
      console.log(`  ✓ 已刪 ${c.name}`);
    } else {
      console.log(`  [DRY] 會刪 ${c.name}`);
    }
  }
}

console.log('\n=== 完成 ===');
if (DRY) console.log('這是 DRY RUN,實際沒有刪。移除 --dry-run 再跑一次才會真的刪。');
