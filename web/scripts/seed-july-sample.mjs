#!/usr/bin/env node
// 一次性 seed:把雇主 7 月記帳樣本(來源:1 12sexwjF... 那份 Google Sheet)
// 灌進正式 Supabase 讓 Yen 體驗新帳務系統。
//
// 用法:
//   node --env-file=.env.local scripts/seed-july-sample.mjs
//   node --env-file=.env.local scripts/seed-july-sample.mjs --dry-run   ← 只印會做什麼、不真的寫
//
// 特徵標記(供 wipe 用):
//   - 所有案場名字帶 " (樣本)" 後綴
//   - 所有案件類別名字帶 " (樣本)" 後綴
//   - 所有 ledger_entries 與 receivables 的 memo 以 [7月樣本] 開頭
//
// 想全部清乾淨:
//   node --env-file=.env.local scripts/wipe-july-sample.mjs
//
// 需要環境變數:
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry-run');
const MEMO_PREFIX = '[7月樣本]';
const SUFFIX = ' (樣本)';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY,請用 --env-file=.env.local 執行');
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

// ------- 找一個 boss id 作為 created_by(所有 seed 都掛在他名下) -------
async function pickBoss() {
  const { data, error } = await sb.from('users').select('id, name').eq('role', 'boss').eq('active', true).limit(1).maybeSingle();
  if (error) throw new Error(`找 boss 失敗: ${error.message}`);
  if (!data) throw new Error('找不到 active 的 boss 使用者,請先 seed-users');
  return data;
}

// ------- 案件類別(3 個) -------
const CATEGORIES = ['固定安裝工程', '活動', '維修保養'];

// ------- 案場(10 個,對應 7 月樣本出現的所有案子) -------
const SITES = [
  { name: '恩光堂燈光優化工程',       cat: '固定安裝工程', customer: '恩光堂' },
  { name: '台中大里音控台安裝',       cat: '固定安裝工程', customer: '台中大里' },
  { name: '磐頂教會導播系統工程',     cat: '固定安裝工程', customer: '磐頂教會' },
  { name: '斗六旌旗主堂更新工程',     cat: '固定安裝工程', customer: '斗六旌旗' },
  { name: '北屯音控專案',             cat: '固定安裝工程', customer: '北屯旌旗' },
  { name: '台北旌旗復活節專案',       cat: '活動',         customer: '台北旌旗' },
  { name: '新竹旌旗維修(長期)',      cat: '維修保養',     customer: '新竹旌旗' },
  { name: '磐頂教會維修',             cat: '維修保養',     customer: '磐頂教會' },
  { name: '豐原旌旗-數位麥克風',      cat: '維修保養',     customer: '豐原旌旗' },
  { name: '台北旌旗擴大機維修',       cat: '維修保養',     customer: '台北旌旗' },
];

// ------- 應收(E 欄未收款轉成 receivables) -------
const RECEIVABLES = [
  { party: '新竹旌旗', site: '新竹旌旗維修(長期)',   amount: 31500,  memo: '3月保養工程' },
  { party: '台北旌旗', site: '台北旌旗復活節專案',   amount: 16275,  memo: '復活節專案款' },
  { party: '北屯旌旗', site: '北屯音控專案',         amount: 24990,  memo: '未開發票,含稅 1225' },
  { party: '新竹旌旗', site: '新竹旌旗維修(長期)',   amount: 24675,  memo: '喇叭維修,已開發票 2026-05-07,含稅 1175' },
  { party: '磐頂教會', site: '磐頂教會弦樂麥克風',   amount: 12600,  memo: '弦樂麥克風,未開發票' },
  { party: '磐頂教會', site: '磐頂教會導播系統工程', amount: 265335, memo: '導播系統工程' },
  { party: '斗六旌旗', site: '斗六旌旗主堂更新工程', amount: 407715, memo: '9 月主堂更新工程' },
  { party: '新竹旌旗', site: '新竹旌旗維修(長期)',   amount: 24675,  memo: '硬體維修費用' },
  { party: '豐原旌旗', site: '豐原旌旗-數位麥克風',  amount: 35700,  memo: '數位麥克風款' },
  { party: '磐頂教會', site: '磐頂教會維修',         amount: 4568,   memo: '線材1' },
  { party: '磐頂教會', site: '磐頂教會維修',         amount: 5198,   memo: '線材2' },
];
// 注意:「磐頂教會弦樂麥克風」不在 SITES 裡,想歸「磐頂教會維修」就都合到那;為求精確,seed 時 fallback 掛 null。

// ------- 帳目(收入:只匯 D 欄已入帳的;支出:全部) -------
// 日期沒有精確到日的用 2026-07-15 當代表日
const D15 = '2026-07-15';

const ENTRIES = [
  // === 收入(D 欄=已入帳) ===
  { dir: 'income', kind: 'loan',          amt: 1062811, fee: 0, party: '新加坡',       site: null,                            memo: '新加坡款項-借款(業外,不列營收)' },
  { dir: 'income', kind: 'project',       amt: 218400,  fee: 0, party: '恩光堂',       site: '恩光堂燈光優化工程',            memo: '恩光堂燈光優化工程-6月尾款' },
  { dir: 'income', kind: 'project',       amt: 8400,    fee: 0, party: '台中大里',     site: '台中大里音控台安裝',            memo: '音控台安裝款' },
  { dir: 'income', kind: 'other_income',  amt: 21014,   fee: 0, party: null,           site: null,                            memo: '舊 Excel「不知道為什麼有多的」— 遷入時暫掛其他收入,實際原因待查' },

  // === 支出:薪資/獎金/勞健保(不掛案場,公司運營) ===
  { dir: 'expense', kind: 'salary',       amt: 65000,   fee: 15, party: '吳智仁',       site: null,                            memo: '五月薪資-吳智仁' },
  { dir: 'expense', kind: 'salary',       amt: 32000,   fee: 0,  party: '許舒韶',       site: null,                            memo: '五月薪資-許舒韶' },
  { dir: 'expense', kind: 'salary',       amt: 35000,   fee: 0,  party: '賴泯亘',       site: null,                            memo: '五月薪資-賴泯亘' },
  { dir: 'expense', kind: 'salary',       amt: 10323,   fee: 0,  party: '許舒韶',       site: null,                            memo: '許舒韶-去年到今年勞健保' },
  { dir: 'expense', kind: 'bonus',        amt: 5000,    fee: 0,  party: '許舒韶',       site: null,                            memo: '許舒韶-獎金(公司獎金,不掛案場)' },
  { dir: 'expense', kind: 'bonus',        amt: 5000,    fee: 0,  party: '賴泯亘',       site: null,                            memo: '賴泯亘-獎金(公司獎金,不掛案場)' },

  // === 支出:代墊(舊 Excel 手記;新系統本應走「一鍵匯入零用金」,這裡因 seed 沒零用金流程,先手 seed) ===
  { dir: 'expense', kind: 'reimbursement',amt: 4983,    fee: 0,  party: '許舒韶',       site: null,                            memo: '舒韶代墊(舊 Excel 加總 4938 對不上,以 4983 為準)' },
  { dir: 'expense', kind: 'reimbursement',amt: 7457,    fee: 0,  party: '賴泯亘',       site: null,                            memo: '泯亘代墊(6月加油/停車零用金合計)' },

  // === 支出:貨款(不掛案場=庫存採購;掛案場=直接歸屬到專案) ===
  { dir: 'expense', kind: 'goods',        amt: 345030,  fee: 0,  party: 'CODA',         site: null,                            memo: 'CODA 貨款(庫存採購)' },
  { dir: 'expense', kind: 'goods',        amt: 280400,  fee: 0,  party: 'CODA',         site: '北屯音控專案',                  memo: '北屯旌旗-CODA 貨款(專案直接成本)' },
  { dir: 'expense', kind: 'goods',        amt: 260829,  fee: 0,  party: '新加坡供應商', site: null,                            memo: '新加坡貨款 IP-INV2605051' },
  { dir: 'expense', kind: 'goods',        amt: 23015,   fee: 0,  party: '供應商',       site: '豐原旌旗-數位麥克風',           memo: '豐原旌旗-數位麥克風貨款(專案直接成本)' },
  { dir: 'expense', kind: 'goods',        amt: 2625,    fee: 0,  party: '蔡哥水電',     site: '恩光堂燈光優化工程',            memo: '恩光堂-燈光開關-蔡哥水電(專案直接成本)' },
  { dir: 'expense', kind: 'goods',        amt: 715,     fee: 0,  party: null,           site: '台北旌旗擴大機維修',            memo: '台北旌旗-擴大機維修零件' },

  // === 支出:車輛/稅金/租金/水電/信用卡(公司運營) ===
  { dir: 'expense', kind: 'vehicle',      amt: 2000,    fee: 15, party: null,           site: null,                            memo: '貨車停車場月租-7月' },
  { dir: 'expense', kind: 'tax',          amt: 15210,   fee: 0,  party: null,           site: null,                            memo: '貨車牌照稅(已分期)' },
  { dir: 'expense', kind: 'rent',         amt: 13000,   fee: 15, party: null,           site: null,                            memo: '辦公室租金-7月' },
  { dir: 'expense', kind: 'credit_card',  amt: 53063,   fee: 0,  party: '國泰世華',     site: null,                            memo: '國泰世華信用卡帳單' },
  { dir: 'expense', kind: 'credit_card',  amt: 20761,   fee: 0,  party: '上海銀行',     site: null,                            memo: '上海銀行信用卡帳單' },

  // === 支出:個人項/業外(kind=investment/health/other_expense,報表會自動排除在主營運支出外) ===
  { dir: 'expense', kind: 'health',       amt: 20500,   fee: 0,  party: '老闆',         site: null,                            memo: '健康檢查-老闆(個人項)' },
  { dir: 'expense', kind: 'investment',   amt: 500000,  fee: 0,  party: null,           site: null,                            memo: '股票投資(個人項)' },
  { dir: 'expense', kind: 'other_expense',amt: 15000,   fee: 15, party: '老闆',         site: null,                            memo: '老闆-領零用金(個人項)' },
];

// ---------------------------------------------------------------
// 執行
// ---------------------------------------------------------------

const boss = await pickBoss();
console.log(`使用 boss「${boss.name}」作為 created_by`);
console.log(DRY ? '\n=== DRY RUN(不會真的寫入)===\n' : '\n=== 開始寫入 ===\n');

// 1. 案件類別
const catIdMap = new Map();
for (const catName of CATEGORIES) {
  const full = catName + SUFFIX;
  if (DRY) { console.log(`[DRY] site_categories.insert ${full}`); catIdMap.set(catName, `dry-${catName}`); continue; }
  const cur = await sb.from('site_categories').select('id').eq('name', full).maybeSingle();
  if (cur.data) {
    catIdMap.set(catName, cur.data.id);
    console.log(`  類別已存在,重用: ${full}`);
  } else {
    const ins = await sb.from('site_categories').insert({ name: full, active: true }).select('id').single();
    if (ins.error) { console.error(`類別建立失敗 ${full}: ${ins.error.message}`); process.exit(1); }
    catIdMap.set(catName, ins.data.id);
    console.log(`  ✓ 類別 ${full}`);
  }
}

// 2. 案場
const siteIdMap = new Map();
for (const s of SITES) {
  const full = s.name + SUFFIX;
  if (DRY) { console.log(`[DRY] sites.insert ${full} / cat=${s.cat} / customer=${s.customer}`); siteIdMap.set(s.name, `dry-${s.name}`); continue; }
  const cur = await sb.from('sites').select('id').eq('name', full).maybeSingle();
  if (cur.data) {
    siteIdMap.set(s.name, cur.data.id);
    console.log(`  案場已存在,重用: ${full}`);
  } else {
    const ins = await sb.from('sites').insert({
      name: full, active: true,
      category_id: catIdMap.get(s.cat),
      customer_name: s.customer,
    }).select('id').single();
    if (ins.error) { console.error(`案場建立失敗 ${full}: ${ins.error.message}`); process.exit(1); }
    siteIdMap.set(s.name, ins.data.id);
    console.log(`  ✓ 案場 ${full}`);
  }
}

// 3. 應收
console.log('');
for (const r of RECEIVABLES) {
  const memo = `${MEMO_PREFIX} ${r.memo}`;
  const siteId = r.site ? siteIdMap.get(r.site) : null;
  if (siteId === undefined) { console.warn(`  ⚠ 應收「${r.memo}」找不到案場「${r.site}」,改為不掛案場`); }
  if (DRY) { console.log(`[DRY] receivables.insert ${r.party} ${r.amount} ${r.memo}`); continue; }
  const ins = await sb.from('receivables').insert({
    direction: 'receivable',
    party: r.party,
    site_id: siteId ?? null,
    total_amount_twd: r.amount,
    memo,
    created_by: boss.id,
  }).select('id').single();
  if (ins.error) { console.error(`應收建立失敗 ${memo}: ${ins.error.message}`); process.exit(1); }
  console.log(`  ✓ 應收 ${r.party} $${r.amount.toLocaleString()} - ${r.memo}`);
}

// 4. 帳目
console.log('');
let successCount = 0;
for (const e of ENTRIES) {
  const memo = `${MEMO_PREFIX} ${e.memo}`;
  const siteId = e.site ? siteIdMap.get(e.site) : null;
  if (e.site && siteId === undefined) { console.warn(`  ⚠ 帳目「${e.memo}」找不到案場「${e.site}」,改為不掛案場`); }
  if (DRY) { console.log(`[DRY] ledger_entries.insert ${e.dir}/${e.kind} $${e.amt} ${e.memo}`); successCount++; continue; }
  const ins = await sb.from('ledger_entries').insert({
    occurred_on: D15,
    direction: e.dir,
    kind: e.kind,
    amount_twd: e.amt,
    fee_twd: e.fee ?? 0,
    party: e.party,
    memo,
    is_external: false,
    invoice_status: 'none',
    tax_amount_twd: 0,
    site_id: siteId ?? null,
    status: 'active',
    created_by: boss.id,
  }).select('id').single();
  if (ins.error) { console.error(`帳目建立失敗 ${memo}: ${ins.error.message}`); process.exit(1); }
  successCount++;
  console.log(`  ✓ ${e.dir === 'income' ? '收' : '支'} ${e.kind} $${e.amt.toLocaleString()} - ${e.memo}`);
}

// 5. 結尾摘要
console.log('\n=== 完成 ===');
console.log(`類別: ${CATEGORIES.length} 個`);
console.log(`案場: ${SITES.length} 個`);
console.log(`應收: ${RECEIVABLES.length} 筆`);
console.log(`帳目: ${successCount} 筆`);
if (DRY) console.log('\n這是 DRY RUN,實際沒有寫入。移除 --dry-run 再跑一次才會真的寫入。');
else console.log('\n請到 /boss/report?period=month&value=2026-07 看效果。想清空請跑:\n  node --env-file=.env.local scripts/wipe-july-sample.mjs');
