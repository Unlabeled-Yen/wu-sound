#!/usr/bin/env node
// 清除 seed-equipment-color-check.mjs 塞進去的測試資料。
// 依 [色彩測試] name prefix 刪除,不會誤刪其他資料。
//
// 用法:
//   node --env-file=.env.local scripts/wipe-equipment-color-check.mjs
//   node --env-file=.env.local scripts/wipe-equipment-color-check.mjs --dry-run

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

console.log(DRY ? '=== DRY RUN(不會真的刪)===' : '=== 開始刪除 ===');

const eq = await sb.from('equipment').select('id, name').like('name', `${NAME_PREFIX}%`);
if (eq.error) { console.error(`查詢失敗: ${eq.error.message}`); process.exit(1); }
console.log(`設備: 找到 ${eq.data.length} 筆帶 ${NAME_PREFIX} 前綴的紀錄`);

if (!DRY && eq.data.length > 0) {
  const ids = eq.data.map((r) => r.id);
  // equipment_movements 有 on delete cascade,刪 equipment 會一併清掉,不用另外刪。
  const del = await sb.from('equipment').delete().in('id', ids);
  if (del.error) { console.error(`刪除失敗: ${del.error.message}`); process.exit(1); }
  console.log('  ✓ 已刪(equipment_movements 隨 cascade 一併清除)');
}

console.log(DRY ? '\nDRY RUN 結束,沒有真的刪除。' : '\n=== 完成 ===');
