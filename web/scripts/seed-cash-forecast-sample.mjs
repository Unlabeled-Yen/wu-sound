#!/usr/bin/env node
// 一次性 seed:專門測試「未來四週現金」時間軸用的應收/應付樣本。
//
// 背景:receivables.agreed_due_date 是 018 migration 才加的欄位,舊資料全是 NULL,
// 全部落在「未排定」桶,四週時間軸自然是空的——這不是 bug,是刻意不猜日期
// (見 018 migration 與 ledger-cash-forecast.ts 的說明)。這支腳本補一組帶約定日期
// 的樣本,涵蓋:已逾期、本週、第 2-4 週、4 週以外,外加保留幾筆 NULL,
// 讓「未來四週現金」的所有分支(含未排定/超出範圍的提示文字)都有資料可看。
//
// 用法:
//   node --env-file=.env.local scripts/seed-cash-forecast-sample.mjs
//   node --env-file=.env.local scripts/seed-cash-forecast-sample.mjs --dry-run
//
// 特徵標記(供 wipe 用):所有 memo 以 [現金流測試] 開頭
//
// 想清乾淨:
//   node --env-file=.env.local scripts/wipe-cash-forecast-sample.mjs
//
// 需要環境變數:NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY

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

async function pickBoss() {
  const { data, error } = await sb.from('users').select('id, name').eq('role', 'boss').eq('active', true).limit(1).maybeSingle();
  if (error) throw new Error(`找 boss 失敗: ${error.message}`);
  if (!data) throw new Error('找不到 active 的 boss 使用者,請先 seed-users');
  return data;
}

function addDays(days) {
  const dt = new Date();
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

// 涵蓋 buildCashForecast 的每個分支:offset<0(逾期)、0-27(四週內每週各一筆)、
// >27(超出範圍)、agreed_due_date=null(未排定,刻意保留幾筆驗證這條路徑沒消失)。
const RECEIVABLES = [
  { party: '測試客戶-已逾期',   amount: 45000,  dueOffset: -5,   memo: '已逾期 5 天,測試第 0 週紅字' },
  { party: '測試客戶-本週',     amount: 62000,  dueOffset: 2,    memo: '本週到期' },
  { party: '測試客戶-第2週',    amount: 38500,  dueOffset: 10,   memo: '第 2 週到期' },
  { party: '測試客戶-第3週',    amount: 120000, dueOffset: 17,   memo: '第 3 週到期' },
  { party: '測試客戶-第4週',    amount: 28000,  dueOffset: 24,   memo: '第 4 週到期' },
  { party: '測試客戶-超出範圍', amount: 90000,  dueOffset: 45,   memo: '4 週以後到期,測試 beyond 分支' },
  { party: '測試客戶-未排定A',  amount: 15000,  dueOffset: null, memo: '無約定日,測試未排定分支仍正常顯示' },
];

const PAYABLES = [
  { party: '測試廠商-已逾期',   amount: 12000,  dueOffset: -2,  memo: '已逾期 2 天' },
  { party: '測試廠商-本週',     amount: 35000,  dueOffset: 4,   memo: '本週到期' },
  { party: '測試廠商-第2週',    amount: 21000,  dueOffset: 12,  memo: '第 2 週到期' },
  { party: '測試廠商-第4週',    amount: 8600,   dueOffset: 26,  memo: '第 4 週到期' },
  { party: '測試廠商-未排定B',  amount: 5000,   dueOffset: null, memo: '無約定日' },
];

const boss = await pickBoss();
console.log(`使用 boss「${boss.name}」作為 created_by`);
console.log(DRY ? '\n=== DRY RUN(不會真的寫入)===\n' : '\n=== 開始寫入 ===\n');

async function insertAll(direction, rows) {
  for (const r of rows) {
    const memo = `${MEMO_PREFIX} ${r.memo}`;
    const agreedDueDate = r.dueOffset === null ? null : addDays(r.dueOffset);
    if (DRY) {
      console.log(`[DRY] receivables.insert ${direction} ${r.party} $${r.amount} due=${agreedDueDate ?? 'NULL'}`);
      continue;
    }
    const ins = await sb.from('receivables').insert({
      direction,
      party: r.party,
      site_id: null,
      total_amount_twd: r.amount,
      memo,
      agreed_due_date: agreedDueDate,
      created_by: boss.id,
    }).select('id').single();
    if (ins.error) { console.error(`建立失敗 ${memo}: ${ins.error.message}`); process.exit(1); }
    console.log(`  ✓ ${direction === 'receivable' ? '應收' : '應付'} ${r.party} $${r.amount.toLocaleString()} 約定日=${agreedDueDate ?? '(未排定)'}`);
  }
}

await insertAll('receivable', RECEIVABLES);
await insertAll('payable', PAYABLES);

console.log('\n=== 完成 ===');
console.log(`應收: ${RECEIVABLES.length} 筆 / 應付: ${PAYABLES.length} 筆`);
if (DRY) console.log('\n這是 DRY RUN,實際沒有寫入。移除 --dry-run 再跑一次才會真的寫入。');
else console.log('\n請到 /boss/ledger 看「未來四週現金」時間軸。想清空請跑:\n  node --env-file=.env.local scripts/wipe-cash-forecast-sample.mjs');
