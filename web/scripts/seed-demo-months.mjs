#!/usr/bin/env node
// Demo 資料:產生跨 12 個月的帳目,讓新首頁的趨勢線/比例條/排行有東西可看。
// 這是「為了評估 UI 設計」而生的假資料,不是真實帳務。
//
// 用法:
//   node --env-file=.env.local scripts/seed-demo-months.mjs --dry-run   ← 只印會做什麼
//   node --env-file=.env.local scripts/seed-demo-months.mjs             ← 真的寫入
//   node --env-file=.env.local scripts/wipe-demo-months.mjs             ← 全部清乾淨
//
// 特徵標記(供 wipe 用,刻意跟 [7月樣本] 分開,兩批互不干擾):
//   - 案場/ 類別名字帶 " (DEMO)" 後綴
//   - ledger_entries 與 receivables 的 memo 以 [DEMO] 開頭
//
// 資料是決定性的(自己帶 PRNG,不用 Math.random),同樣參數重跑結果一樣。

import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry-run');
const MEMO_PREFIX = '[DEMO]';
const SUFFIX = ' (DEMO)';
const MONTHS_BACK = 24;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY,請用 --env-file=.env.local 執行');
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

// 決定性 PRNG(mulberry32),讓每次跑出來的數字一樣,方便重現與比對
let _s = 20260815;
function rnd() {
  _s |= 0; _s = (_s + 0x6D2B79F5) | 0;
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const between = (lo, hi) => Math.round(lo + rnd() * (hi - lo));

// 從「今天所在月」往回推 N 個月,產生 YYYY-MM 清單(舊→新)
function recentMonths(n) {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-based
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}
const dayIn = (month, day) => `${month}-${String(day).padStart(2, '0')}`;

const CATEGORIES = ['固定安裝工程', '活動', '維修保養'];

const SITES = [
  { name: '恩光堂主堂音響更新',     cat: '固定安裝工程', customer: '恩光堂' },
  { name: '磐頂長老教會導播系統',   cat: '固定安裝工程', customer: '磐頂長老教會' },
  { name: '斗六旌旗主堂工程',       cat: '固定安裝工程', customer: '斗六旌旗' },
  { name: '北屯旌旗音控室',         cat: '固定安裝工程', customer: '北屯旌旗' },
  { name: '新竹旌旗主堂擴建',       cat: '固定安裝工程', customer: '新竹旌旗' },
  { name: '豐原旌旗燈光系統',       cat: '固定安裝工程', customer: '豐原旌旗' },
  { name: '台北靈糧堂音控室',       cat: '固定安裝工程', customer: '台北靈糧堂' },
  { name: 'THE HOPE 聖誕特會',      cat: '活動',         customer: 'THE HOPE Taipei' },
  { name: '旌旗年度感恩餐會',       cat: '活動',         customer: '旌旗教會總會' },
  { name: '磐頂教會復活節特會',     cat: '活動',         customer: '磐頂長老教會' },
  { name: '新竹旌旗年度維保',       cat: '維修保養',     customer: '新竹旌旗' },
  { name: '豐原旌旗器材維修',       cat: '維修保養',     customer: '豐原旌旗' },
  { name: '恩光堂年度校音',         cat: '維修保養',     customer: '恩光堂' },
  { name: '台北靈糧堂設備保養',     cat: '維修保養',     customer: '台北靈糧堂' },
];

// 每月固定營運支出(公司運營,不掛案場)——讓趨勢線有穩定的基底
const MONTHLY_FIXED = [
  { kind: 'salary', party: '吳智仁', amt: 65000, fee: 15, memo: '月薪-吳智仁' },
  { kind: 'salary', party: '許舒韶', amt: 32000, fee: 0,  memo: '月薪-許舒韶' },
  { kind: 'salary', party: '賴泯亘', amt: 35000, fee: 0,  memo: '月薪-賴泯亘' },
  { kind: 'rent',   party: null,     amt: 13000, fee: 15, memo: '辦公室租金' },
];

const months = recentMonths(MONTHS_BACK);

// ---- 組資料 ----
const entries = [];   // { month, day, dir, kind, amt, fee, party, site, memo, external, invoiceStatus }
const receivables = []; // { party, site, amount, memo, status, settleMonth? }

for (let i = 0; i < months.length; i++) {
  const month = months[i];
  const isPeak = [10, 11, 3].includes(Number(month.split('-')[1])); // 聖誕/復活節前後較忙

  // 固定支出
  for (const f of MONTHLY_FIXED) {
    entries.push({ month, day: 5, dir: 'expense', kind: f.kind, amt: f.amt, fee: f.fee, party: f.party, site: null, memo: f.memo });
  }
  // 水電(每月浮動)
  entries.push({ month, day: 12, dir: 'expense', kind: 'utility', amt: between(2200, 4800), fee: 0, party: null, site: null, memo: '辦公室水電' });
  // 車輛(隔月)
  if (i % 2 === 0) {
    entries.push({ month, day: 18, dir: 'expense', kind: 'vehicle', amt: between(1800, 6500), fee: 0, party: null, site: null, memo: pick(['貨車加油', '貨車保養', '停車場月租']) });
  }
  // 代墊(零用金)——每月 1-2 筆,金額有大有小
  const reimburseCount = between(1, 2);
  for (let k = 0; k < reimburseCount; k++) {
    entries.push({ month, day: between(15, 26), dir: 'expense', kind: 'reimbursement', amt: between(1500, 14000), fee: 0, party: pick(['許舒韶', '賴泯亘', '陳建宏', '林佳穎']), site: null, memo: pick(['現場代墊彙整', '油資/停車代墊', '現場材料代墊']) });
  }
  // 信用卡帳單(歷史資料,新表單雖已退役但舊資料仍該有,測資料多樣性)
  if (i % 3 === 0) {
    entries.push({ month, day: 10, dir: 'expense', kind: 'credit_card', amt: between(15000, 68000), fee: 0, party: pick(['國泰世華', '上海銀行', '玉山銀行']), site: null, memo: '信用卡帳單' });
  }

  // 案件收款:旺季 3-5 筆、淡季 2-3 筆
  const incomeCount = isPeak ? between(3, 5) : between(2, 3);
  for (let k = 0; k < incomeCount; k++) {
    const s = pick(SITES);
    const amt = isPeak ? between(80000, 480000) : between(25000, 220000);
    const external = rnd() > 0.4;
    entries.push({
      month, day: between(4, 27), dir: 'income', kind: 'project', amt, fee: rnd() > 0.7 ? 30 : 0,
      party: s.customer, site: s.name, memo: pick(['工程款', '期中款', '尾款', '訂金', '追加項目款']),
      external, invoiceStatus: external ? (rnd() > 0.25 ? 'issued' : 'to_issue') : 'none',
    });
  }
  // 業外/其他收入:偶發
  if (rnd() > 0.7) {
    entries.push({ month, day: between(3, 25), dir: 'income', kind: 'other_income', amt: between(3000, 40000), fee: 0, party: null, site: null, memo: pick(['設備出租收入', '報廢器材出售', '講座授課費']) });
  }
  if (rnd() > 0.9) {
    entries.push({ month, day: 15, dir: 'income', kind: 'loan', amt: between(200000, 900000), fee: 0, party: pick(['股東', '銀行']), site: null, memo: '業外借款(不列營收)' });
  }

  // 專案直接成本(貨款),跟著案子走——旺季多筆、淡季 1-2 筆
  const goodsCount = isPeak ? between(2, 4) : between(1, 2);
  for (let k = 0; k < goodsCount; k++) {
    const s = pick(SITES);
    entries.push({
      month, day: between(3, 25), dir: 'expense', kind: 'goods',
      amt: isPeak ? between(60000, 320000) : between(15000, 140000), fee: 0,
      party: pick(['CODA', 'YAMAHA 代理', '新加坡供應商', '線材行', 'JBL 台灣總代理', '弘星音響器材']), site: s.name, memo: pick(['器材採購', '喇叭系統採購', '控台/週邊採購', '線材耗材']),
    });
  }

  // 偶發:稅金 / 其他支出
  if (Number(month.split('-')[1]) === 5) {
    entries.push({ month, day: 28, dir: 'expense', kind: 'tax', amt: between(28000, 65000), fee: 0, party: null, site: null, memo: '營所稅' });
  }
  if (rnd() > 0.6) {
    entries.push({ month, day: between(10, 26), dir: 'expense', kind: 'other_expense', amt: between(3000, 25000), fee: 0, party: null, site: null, memo: pick(['軟體訂閱年費', '展會參訪', '教育訓練', '文具耗材', '網站/主機費']) });
  }
  // 偶發:業外(老闆個人)
  if (rnd() > 0.8) {
    entries.push({ month, day: 20, dir: 'expense', kind: 'investment', amt: between(80000, 400000), fee: 0, party: null, site: null, memo: '股票/基金投資(個人項)' });
  }
  if (rnd() > 0.85) {
    entries.push({ month, day: 24, dir: 'expense', kind: 'health', amt: between(6000, 32000), fee: 0, party: '老闆', site: null, memo: '健康檢查(個人項)' });
  }
  // 獎金:年終月、年中偶發
  if (Number(month.split('-')[1]) === 1) {
    for (const name of ['許舒韶', '賴泯亘', '陳建宏']) {
      entries.push({ month, day: 10, dir: 'expense', kind: 'bonus', amt: between(8000, 30000), fee: 0, party: name, site: null, memo: '年終獎金' });
    }
  }
}

// 應收:一部分未結(要出現在「未收」)、一部分已結清
const RECEIVABLE_SPECS = [
  { site: '斗六旌旗主堂工程',       party: '斗六旌旗',        amount: 407715, memo: '主堂更新工程-尾款',     status: 'open' },
  { site: '磐頂長老教會導播系統',   party: '磐頂長老教會',    amount: 265335, memo: '導播系統工程-期中款',   status: 'open' },
  { site: 'THE HOPE 聖誕特會',      party: 'THE HOPE Taipei', amount: 98000,  memo: '聖誕特會-結案款',       status: 'open' },
  { site: '新竹旌旗年度維保',       party: '新竹旌旗',        amount: 31500,  memo: '年度保養-Q3',           status: 'open' },
  { site: '新竹旌旗主堂擴建',       party: '新竹旌旗',        amount: 186400, memo: '主堂擴建-期中款',       status: 'open' },
  { site: '台北靈糧堂音控室',       party: '台北靈糧堂',      amount: 152000, memo: '音控室工程-尾款',       status: 'open' },
  { site: '旌旗年度感恩餐會',       party: '旌旗教會總會',    amount: 43500,  memo: '感恩餐會活動款',        status: 'open' },
  { site: '磐頂教會復活節特會',     party: '磐頂長老教會',    amount: 27800,  memo: '復活節特會活動款',      status: 'open' },
  { site: '豐原旌旗器材維修',       party: '豐原旌旗',        amount: 35700,  memo: '數位麥克風款',          status: 'closed' },
  { site: '恩光堂主堂音響更新',     party: '恩光堂',          amount: 218400, memo: '主堂音響-尾款',         status: 'closed' },
  { site: '恩光堂年度校音',         party: '恩光堂',          amount: 18600,  memo: '年度校音費用',          status: 'closed' },
  { site: '台北靈糧堂設備保養',     party: '台北靈糧堂',      amount: 22400,  memo: '設備保養季費',          status: 'closed' },
];
receivables.push(...RECEIVABLE_SPECS.map((r) => ({ ...r, direction: 'receivable' })));

// 應付:欠廠商的(要出現在「未付」)
const PAYABLE_SPECS = [
  { site: '斗六旌旗主堂工程',   party: 'CODA',           amount: 280400, memo: '主堂喇叭貨款-未付',   status: 'open' },
  { site: null,                 party: '新加坡供應商',   amount: 160829, memo: '進口器材貨款-未付',   status: 'open' },
  { site: '北屯旌旗音控室',     party: 'YAMAHA 代理',    amount: 74500,  memo: '混音器貨款-未付',     status: 'open' },
  { site: '新竹旌旗主堂擴建',   party: 'JBL 台灣總代理', amount: 98200,  memo: '喇叭系統貨款-未付',   status: 'open' },
  { site: '豐原旌旗燈光系統',   party: '弘星音響器材',   amount: 46700,  memo: '燈光設備貨款-未付',   status: 'open' },
  { site: null,                 party: '線材行',         amount: 12300,  memo: '線材耗材-未付',       status: 'closed' },
];
receivables.push(...PAYABLE_SPECS.map((r) => ({ ...r, direction: 'payable' })));

// ---------------------------------------------------------------
// 摘要(dry-run 也看得到)
// ---------------------------------------------------------------
const byMonth = {};
for (const e of entries) {
  byMonth[e.month] ??= { income: 0, expense: 0, n: 0 };
  byMonth[e.month][e.dir] += e.amt;
  byMonth[e.month].n++;
}
console.log(`\n=== Demo 資料摘要(${months[0]} ~ ${months[months.length - 1]},共 ${months.length} 個月)===`);
for (const m of months) {
  const v = byMonth[m];
  const net = v.income - v.expense;
  console.log(` ${m}  收 ${String(v.income).padStart(9)}  支 ${String(v.expense).padStart(9)}  淨 ${String(net).padStart(10)}  (${v.n}筆)`);
}
const openRecv = receivables.filter((r) => r.direction === 'receivable' && r.status === 'open');
const openPay = receivables.filter((r) => r.direction === 'payable' && r.status === 'open');
console.log(`\n 帳目合計 ${entries.length} 筆`);
console.log(` 應收 ${receivables.filter((r) => r.direction === 'receivable').length} 筆(未結 ${openRecv.length},未收 $${openRecv.reduce((s, r) => s + r.amount, 0).toLocaleString()})`);
console.log(` 應付 ${receivables.filter((r) => r.direction === 'payable').length} 筆(未結 ${openPay.length},未付 $${openPay.reduce((s, r) => s + r.amount, 0).toLocaleString()})`);
console.log('');

if (DRY) {
  console.log('=== DRY RUN,不會寫入任何資料 ===\n');
  process.exit(0);
}

// ---------------------------------------------------------------
// 寫入
// ---------------------------------------------------------------
const { data: boss, error: bossErr } = await sb
  .from('users').select('id, name').eq('role', 'boss').eq('active', true).limit(1).maybeSingle();
if (bossErr || !boss) { console.error('找不到 active 的 boss 使用者'); process.exit(1); }
console.log(`使用 boss「${boss.name}」作為 created_by\n=== 開始寫入 ===\n`);

// 1. 類別
const catIdMap = new Map();
for (const catName of CATEGORIES) {
  const full = catName + SUFFIX;
  const cur = await sb.from('site_categories').select('id').eq('name', full).maybeSingle();
  if (cur.data) { catIdMap.set(catName, cur.data.id); console.log(`  類別已存在,重用: ${full}`); continue; }
  const ins = await sb.from('site_categories').insert({ name: full, active: true }).select('id').single();
  if (ins.error) { console.error(`類別建立失敗 ${full}: ${ins.error.message}`); process.exit(1); }
  catIdMap.set(catName, ins.data.id);
  console.log(`  ✓ 類別 ${full}`);
}

// 2. 案場
const siteIdMap = new Map();
for (const s of SITES) {
  const full = s.name + SUFFIX;
  const cur = await sb.from('sites').select('id').eq('name', full).maybeSingle();
  if (cur.data) { siteIdMap.set(s.name, cur.data.id); console.log(`  案場已存在,重用: ${full}`); continue; }
  const ins = await sb.from('sites').insert({
    name: full, active: true, category_id: catIdMap.get(s.cat), customer_name: s.customer,
  }).select('id').single();
  if (ins.error) { console.error(`案場建立失敗 ${full}: ${ins.error.message}`); process.exit(1); }
  siteIdMap.set(s.name, ins.data.id);
  console.log(`  ✓ 案場 ${full}`);
}

// 3. 應收應付
console.log('');
let recvOk = 0;
for (const r of receivables) {
  const ins = await sb.from('receivables').insert({
    direction: r.direction,
    party: r.party,
    site_id: r.site ? siteIdMap.get(r.site) ?? null : null,
    total_amount_twd: r.amount,
    memo: `${MEMO_PREFIX} ${r.memo}`,
    status: r.status,
    created_by: boss.id,
  }).select('id').single();
  if (ins.error) { console.error(`  ✗ 應收應付「${r.memo}」: ${ins.error.message}`); continue; }
  recvOk++;
}
console.log(`  ✓ 應收應付 ${recvOk}/${receivables.length} 筆`);

// 4. 帳目
// journal 由 kind 決定,跟 API 同一份對照(server 端唯一真相)
const KIND_TO_JOURNAL = {
  project: 'customer', other_income: 'customer',
  goods: 'vendor', vehicle: 'vendor', rent: 'vendor', utility: 'vendor', tax: 'vendor', other_expense: 'vendor', credit_card: 'vendor',
  reimbursement: 'pettycash',
  salary: 'payroll', bonus: 'payroll',
  loan: 'personal', investment: 'personal', health: 'personal',
};

let entryOk = 0;
for (const e of entries) {
  const siteId = e.site ? siteIdMap.get(e.site) ?? null : null;
  const external = Boolean(e.external);
  const invoiceStatus = e.invoiceStatus ?? 'none';
  const tax = external ? Math.round(e.amt * 0.05) : 0;
  const ins = await sb.from('ledger_entries').insert({
    occurred_on: dayIn(e.month, e.day),
    direction: e.dir,
    kind: e.kind,
    amount_twd: e.amt,
    fee_twd: e.fee ?? 0,
    party: e.party,
    memo: `${MEMO_PREFIX} ${e.memo}`,
    is_external: external,
    invoice_status: invoiceStatus,
    invoice_date: invoiceStatus === 'issued' ? dayIn(e.month, Math.min(28, e.day + 1)) : null,
    tax_amount_twd: tax,
    site_id: siteId,
    site_distribution: siteId ? { [siteId]: 100 } : null,
    journal: KIND_TO_JOURNAL[e.kind],
    created_by: boss.id,
  }).select('id').single();
  if (ins.error) { console.error(`  ✗ 帳目「${e.memo}」${e.month}: ${ins.error.message}`); continue; }
  entryOk++;
}
console.log(`  ✓ 帳目 ${entryOk}/${entries.length} 筆`);

console.log('\n=== 完成 ===');
console.log('清除:node --env-file=.env.local scripts/wipe-demo-months.mjs');
