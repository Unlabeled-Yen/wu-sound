import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

/**
 * 匯入 docs/catalog-spec-audit-round1.md 的 12 項聲學規格(HS5 除外,官方查無 max SPL)。
 * 只信原廠來源,見該 audit 檔案逐項 source URL。有命名疑慮的項目(G308i / Linus6.4i)
 * 資料照樣先進去,疑慮寫進 note 欄位待老闆核對實體銘牌後修正——不因為疑慮就整項不進。
 *
 * 用法:cd web && node scripts/import-catalog-specs-round1.mjs [--dry-run]
 */

const DRY_RUN = process.argv.includes('--dry-run');

const envText = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const env = {};
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// { brand, name } 精確比對(不用模糊),找不到剛好 1 筆就整批中止,不猜。
const ITEMS = [
  {
    brand: 'CODA', name: 'D5-Cube',
    max_spl_db: 117, spl_ref_distance_m: 1, sensitivity_db_1w1m: 91, speaker_impedance_ohm: 16,
    noteAppend: null,
  },
  {
    brand: 'CODA', name: 'G308i',
    max_spl_db: 124, spl_ref_distance_m: 1, sensitivity_db_1w1m: 94.5, speaker_impedance_ohm: 8,
    noteAppend: '⚠️ 待核對:原廠僅列 G308-Pro(touring)與 G308(install variant),數字取自 G308-Pro 頁面共用 acoustic engine 假設同款。請核對實體銘牌完整型號。',
  },
  {
    brand: 'CODA', name: 'G512',
    max_spl_db: 132, spl_ref_distance_m: 1, sensitivity_db_1w1m: 98, speaker_impedance_ohm: 8,
    noteAppend: null,
  },
  {
    brand: 'CODA', name: 'HOPS8i',
    max_spl_db: 133.5, spl_ref_distance_m: 1, sensitivity_db_1w1m: 98, speaker_impedance_ohm: 8,
    noteAppend: '校準點:數字取自 codaaudio.com/speakers/hops8i/,pink noise 12dB crest A-weighted。若與老闆 phase3 實測記憶差 3dB 以上需重查。',
  },
  {
    brand: 'CODA', name: 'G15-SUB',
    max_spl_db: 138, spl_ref_distance_m: 1, sensitivity_db_1w1m: 101, speaker_impedance_ohm: 8,
    noteAppend: null,
  },
  {
    brand: 'CODA', name: 'U12i-Sub',
    max_spl_db: 130, spl_ref_distance_m: 1, sensitivity_db_1w1m: 95, speaker_impedance_ohm: 4,
    noteAppend: '⚠️ 阻抗 4Ω(非常見 8Ω),配 Linus6.4 用 4Ω 檔 800W/ch,不是 8Ω 檔 500W。',
  },
  {
    brand: 'CODA', name: 'U15-SUB',
    max_spl_db: 133, spl_ref_distance_m: 1, sensitivity_db_1w1m: 97, speaker_impedance_ohm: 4,
    noteAppend: '⚠️ 阻抗 4Ω(非常見 8Ω),配 Linus6.4 用 4Ω 檔 800W/ch,不是 8Ω 檔 500W。',
  },
  {
    brand: 'YAMAHA', name: 'CBR12',
    max_spl_db: 125, spl_ref_distance_m: 1, sensitivity_db_1w1m: 96, speaker_impedance_ohm: 8,
    noteAppend: null,
  },
  {
    brand: 'YAMAHA', name: 'CHR12M',
    max_spl_db: 123, spl_ref_distance_m: 1, sensitivity_db_1w1m: 93, speaker_impedance_ohm: 8,
    noteAppend: null,
  },
  {
    brand: 'YAMAHA', name: 'DHR12',
    max_spl_db: 130, spl_ref_distance_m: 1, sensitivity_db_1w1m: null, speaker_impedance_ohm: null,
    noteAppend: '⚠️ 主動喇叭,注意與 DHR12M(floor monitor,129dB,H90/V90)是不同型號,別混用。',
  },
  {
    brand: 'CODA', name: 'Linus6.4i',
    amp_power_w: 500, amp_power_mode: 'rms',
    noteAppend: '⚠️ 待核對:原廠 electronics 頁只列 LINUS6.4 與 LINUS6.4-ID,取用 -ID 版數字假設同款,請核對實體銘牌。RMS 500W@8Ω/ch(4Ω=800W,2Ω=1500W);burst peak 1000W@8Ω。',
  },
  {
    brand: 'YAMAHA', name: 'PX3',
    amp_power_w: 300, amp_power_mode: 'burst',
    noteAppend: '⚠️ 這是 20ms burst 值,原廠未公布 continuous RMS,跟 CODA Linus6.4 的 500W RMS 不能直接比較(PX3 continuous 實際可能只有 200W 級)。4Ω=500W/ch。',
  },
];

// HS5 只補說明,規格欄位維持 null——不進假數字
const HS5_NOTE = '⚠️ 錄音室監聽喇叭,原廠規格表刻意不公布 max SPL(合理:主打準確度非音量)。不建議用於場地覆蓋估算,SPL 計算器選用時應提示警語。';

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
    const patch = {};
    if ('max_spl_db' in item) patch.max_spl_db = item.max_spl_db;
    if ('spl_ref_distance_m' in item) patch.spl_ref_distance_m = item.spl_ref_distance_m;
    if ('sensitivity_db_1w1m' in item) patch.sensitivity_db_1w1m = item.sensitivity_db_1w1m;
    if ('speaker_impedance_ohm' in item) patch.speaker_impedance_ohm = item.speaker_impedance_ohm;
    if ('amp_power_w' in item) patch.amp_power_w = item.amp_power_w;
    if ('amp_power_mode' in item) patch.amp_power_mode = item.amp_power_mode;
    if (item.noteAppend) patch.note = mergeNote(row.note, item.noteAppend);

    console.log(`${item.brand} ${item.name} (${row.id})`);
    console.log('  ', JSON.stringify(patch));

    if (!DRY_RUN) {
      const { error } = await sb.from('catalog_items').update(patch).eq('id', row.id);
      if (error) throw new Error(`寫入 ${item.brand} ${item.name} 失敗: ${error.message}`);
    }
  }

  // HS5:只補 note,規格欄位不動(維持 null)
  const hs5 = await findOne('YAMAHA', 'HS5');
  const hs5Patch = { note: mergeNote(hs5.note, HS5_NOTE) };
  console.log(`YAMAHA HS5 (${hs5.id})`);
  console.log('  ', JSON.stringify(hs5Patch), '(規格欄位維持 null)');
  if (!DRY_RUN) {
    const { error } = await sb.from('catalog_items').update(hs5Patch).eq('id', hs5.id);
    if (error) throw new Error(`寫入 YAMAHA HS5 失敗: ${error.message}`);
  }

  console.log(`\n完成:${ITEMS.length} 項規格數字 + HS5 備註。${DRY_RUN ? '(dry-run,未實際寫入)' : ''}`);
}

run().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
