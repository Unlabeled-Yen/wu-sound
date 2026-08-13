import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

/**
 * 匯入 docs/catalog-coverage-angle-audit.md 的 7 項水平/垂直覆蓋角。
 * 只信原廠來源(全數沿用 round1 已確認的原廠官網 Technical Specifications 頁)。
 * DHR12M 不在此列——catalog_items 沒有這個獨立品項,agent 查它只是拿來對照證明
 * DHR12 的 H90/V60 確實跟 DHR12M 的 H90/V90 不同款,不會被誤套。
 *
 * 用法:cd web && node scripts/import-catalog-coverage-angle.mjs [--dry-run]
 */

const DRY_RUN = process.argv.includes('--dry-run');

const envText = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const env = {};
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const ITEMS = [
  { brand: 'CODA', name: 'D5-Cube', coverage_h_deg: 90, coverage_v_deg: 90, noteAppend: null },
  {
    brand: 'CODA', name: 'G308i', coverage_h_deg: 90, coverage_v_deg: 90,
    noteAppend: '覆蓋角沿用同一頁(G308-Pro)命名疑慮,見上方 SPL 規格備註。',
  },
  { brand: 'CODA', name: 'G512', coverage_h_deg: 90, coverage_v_deg: 60, noteAppend: null },
  { brand: 'CODA', name: 'HOPS8i', coverage_h_deg: 100, coverage_v_deg: 100, noteAppend: null },
  { brand: 'YAMAHA', name: 'CBR12', coverage_h_deg: 90, coverage_v_deg: 60, noteAppend: null },
  { brand: 'YAMAHA', name: 'CHR12M', coverage_h_deg: 90, coverage_v_deg: 90, noteAppend: null },
  {
    brand: 'YAMAHA', name: 'DHR12', coverage_h_deg: 90, coverage_v_deg: 60,
    noteAppend: '覆蓋角 H90/V60(rotatable);同頁 DHR12M 是 H90/V90,兩者不同款,別混用。',
  },
];

async function findOne(brand, name) {
  const { data, error } = await sb
    .from('catalog_items')
    .select('id, note')
    .eq('brand', brand)
    .eq('name', name)
    .eq('active', true);
  if (error) throw new Error(`查詢 ${brand} ${name} 失敗: ${error.message}`);
  if (data.length !== 1) {
    throw new Error(`${brand} ${name} 比對到 ${data.length} 筆(預期剛好 1 筆),中止匯入不猜`);
  }
  return data[0];
}

function mergeNote(existing, append) {
  if (!append) return existing;
  const trimmed = (existing ?? '').trim();
  return trimmed ? `${trimmed}\n${append}` : append;
}

async function run() {
  console.log(DRY_RUN ? '=== DRY RUN(不寫入)===\n' : '=== 正式匯入 ===\n');

  for (const item of ITEMS) {
    const row = await findOne(item.brand, item.name);
    const patch = {
      coverage_h_deg: item.coverage_h_deg,
      coverage_v_deg: item.coverage_v_deg,
    };
    if (item.noteAppend) patch.note = mergeNote(row.note, item.noteAppend);

    console.log(`${item.brand} ${item.name} (${row.id})`);
    console.log('  ', JSON.stringify(patch));

    if (!DRY_RUN) {
      const { error } = await sb.from('catalog_items').update(patch).eq('id', row.id);
      if (error) throw new Error(`寫入 ${item.brand} ${item.name} 失敗: ${error.message}`);
    }
  }

  console.log(`\n完成:${ITEMS.length} 項覆蓋角。三個超低音(G15-SUB/U12i-Sub/U15-SUB)無方向性,維持 null,未動。${DRY_RUN ? '(dry-run,未實際寫入)' : ''}`);
}

run().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
