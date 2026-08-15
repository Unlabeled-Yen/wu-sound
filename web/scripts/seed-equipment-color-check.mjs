#!/usr/bin/env node
// 一次性:幫設備庫存頁補幾筆「維修中」「在案場」的測試資料,純粹用來目視驗證
// 組頭跟「要注意的」四格的紅/黃用色邏輯是否正確——現有 13 筆真實設備全部在
// 庫房,維修中/在案場兩種顏色狀態從沒被觸發過,螢幕上永遠只看得到中性白/灰。
//
// 用法:
//   node --env-file=.env.local scripts/seed-equipment-color-check.mjs
//   node --env-file=.env.local scripts/seed-equipment-color-check.mjs --dry-run
//
// 特徵標記(供 wipe 用):所有 name 以 [色彩測試] 開頭
//
// 想清乾淨:
//   node --env-file=.env.local scripts/wipe-equipment-color-check.mjs

import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry-run');
const NAME_PREFIX = '[色彩測試]';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY,請用 --env-file=.env.local 執行');
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

function daysAgoIso(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

const boss = (await sb.from('users').select('id, name').eq('role', 'boss').eq('active', true).limit(1).maybeSingle()).data;
if (!boss) { console.error('找不到 active 的 boss 使用者'); process.exit(1); }

const site = (await sb.from('sites').select('id, name').eq('active', true).limit(1).maybeSingle()).data;
if (!site) { console.error('找不到 active 的案場,無法建立在案場的測試資料'); process.exit(1); }

console.log(`使用 boss「${boss.name}」、案場「${site.name}」`);
console.log(DRY ? '\n=== DRY RUN(不會真的寫入)===\n' : '\n=== 開始寫入 ===\n');

const ROWS = [
  { name: `${NAME_PREFIX} 主動式喇叭`, brand: 'QSC', model_number: 'K12.2', category: 'speaker', status: 'in_repair', notes: '音圈燒了,測試用', daysAgo: 16 },
  { name: `${NAME_PREFIX} 數位混音台`, brand: 'Yamaha', model_number: 'QL1', category: 'mixer', status: 'on_site', notes: '測試用', siteId: site.id },
];

for (const r of ROWS) {
  if (DRY) {
    console.log(`[DRY] equipment.insert ${r.name} status=${r.status}`);
    continue;
  }
  const ins = await sb.from('equipment').insert({
    name: r.name,
    brand: r.brand,
    model_number: r.model_number,
    category: r.category,
    quantity: 1,
    status: r.status,
    current_site_id: r.siteId ?? null,
    notes: r.notes,
  }).select('id').single();
  if (ins.error) { console.error(`建立失敗 ${r.name}: ${ins.error.message}`); process.exit(1); }
  console.log(`  ✓ ${r.name}(${r.status})`);

  if (r.status === 'in_repair') {
    const mv = await sb.from('equipment_movements').insert({
      equipment_id: ins.data.id,
      moved_by: boss.id,
      moved_at: daysAgoIso(r.daysAgo),
      from_status: 'in_storage',
      to_status: 'in_repair',
      notes: '測試用送修紀錄',
    });
    if (mv.error) console.error(`  ⚠ 移動紀錄寫入失敗: ${mv.error.message}`);
  }
}

console.log(DRY ? '\nDRY RUN 結束。' : '\n=== 完成 ===\n請到 /boss/equipment 看維修中(紅)/在案場(黃)的組頭與要注意的四格用色。\n驗完請跑:\n  node --env-file=.env.local scripts/wipe-equipment-color-check.mjs');
