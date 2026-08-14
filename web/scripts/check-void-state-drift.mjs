#!/usr/bin/env node
// 一次性檢查:F1 修復前,有多少筆帳目因為舊版 voidEntry 只更新 status、
// 沒同步 state,導致 status='voided' 但 state<>'voided'。
//
// 用法:
//   node --env-file=.env.local scripts/check-void-state-drift.mjs

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY,請用 --env-file=.env.local 執行');
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

const { data, error } = await sb
  .from('ledger_entries')
  .select('id, occurred_on, party, memo, status, state')
  .eq('status', 'voided')
  .neq('state', 'voided');

if (error) {
  console.error(`查詢失敗: ${error.message}`);
  process.exit(1);
}

console.log(`找到 ${data.length} 筆 status='voided' 但 state<>'voided' 的帳目`);
for (const r of data) {
  console.log(`  - ${r.id} · ${r.occurred_on} · ${r.party ?? '—'} · ${r.memo ?? ''} · state=${r.state}`);
}
