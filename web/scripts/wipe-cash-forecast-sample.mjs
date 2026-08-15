#!/usr/bin/env node
// 清除 seed-cash-forecast-sample.mjs 塞進去的所有測試資料。
// 依 [現金流測試] memo prefix 刪除,不會誤刪其他資料。
//
// 用法:
//   node --env-file=.env.local scripts/wipe-cash-forecast-sample.mjs
//   node --env-file=.env.local scripts/wipe-cash-forecast-sample.mjs --dry-run

import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry-run');
const MEMO_PREFIX = '[現金流測試]';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY,請用 --env-file=.env.local 執行');
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

console.log(DRY ? '=== DRY RUN(不會真的刪)===' : '=== 開始刪除 ===');

const cnt = await sb.from('receivables').select('id', { count: 'exact', head: true }).like('memo', `${MEMO_PREFIX}%`);
if (cnt.error) { console.error(`查詢失敗: ${cnt.error.message}`); process.exit(1); }
console.log(`應收/應付: 找到 ${cnt.count ?? 0} 筆帶 ${MEMO_PREFIX} 前綴的紀錄`);
if (!DRY && (cnt.count ?? 0) > 0) {
  const del = await sb.from('receivables').delete().like('memo', `${MEMO_PREFIX}%`);
  if (del.error) { console.error(`刪除失敗: ${del.error.message}`); process.exit(1); }
  console.log('  ✓ 已刪');
}

console.log(DRY ? '\nDRY RUN 結束,沒有真的刪除。' : '\n=== 完成 ===');
