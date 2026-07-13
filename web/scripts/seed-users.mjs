#!/usr/bin/env node
// 建立/更新 users 表的一筆使用者。
//
// 用法:
//   node --env-file=.env.local scripts/seed-users.mjs <name> <boss|staff> <4位PIN>
//
// 範例:
//   node --env-file=.env.local scripts/seed-users.mjs 吳智仁 boss 1234
//   node --env-file=.env.local scripts/seed-users.mjs 許舒韶 staff 5678
//
// 需要環境變數:
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';

const [, , name, role, pin] = process.argv;

function usage(msg) {
  if (msg) console.error(`錯誤: ${msg}`);
  console.error('用法: node --env-file=.env.local scripts/seed-users.mjs <name> <boss|staff> <4位PIN>');
  process.exit(1);
}

if (!name) usage('缺少 name');
if (role !== 'boss' && role !== 'staff') usage('role 必須為 boss 或 staff');
if (!/^\d{4}$/.test(pin || '')) usage('PIN 必須為 4 位數字');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY。用 --env-file=.env.local 執行。');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const pin_hash = await bcrypt.hash(pin, 10);

const { data: existing, error: findErr } = await sb
  .from('users')
  .select('id')
  .eq('name', name)
  .maybeSingle();
if (findErr) {
  console.error(`查詢失敗: ${findErr.message}`);
  process.exit(1);
}

if (existing) {
  const { error } = await sb
    .from('users')
    .update({ role, pin_hash, active: true })
    .eq('id', existing.id);
  if (error) {
    console.error(`更新失敗: ${error.message}`);
    process.exit(1);
  }
  console.log(`已更新使用者 ${name} (${role})`);
} else {
  const { error } = await sb
    .from('users')
    .insert({ name, role, pin_hash, active: true });
  if (error) {
    console.error(`建立失敗: ${error.message}`);
    process.exit(1);
  }
  console.log(`已建立使用者 ${name} (${role})`);
}
