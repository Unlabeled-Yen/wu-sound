import 'server-only';

/**
 * voice-lab Lab 2 — 民生 / 救難工具。
 *
 * 為什麼這些要做成「工具」而不是放寬 respond 閘門:
 * 現場會問的時間、日期、天氣、急救,全部都是**有正確答案**的問題。
 * 讓模型憑印象回答等於在說謊(它沒有即時天氣、也不該亂教急救步驟),
 * 而閘門的原則本來就是「講的話要有事實來源」。
 * 所以做法是給它真的資料來源,而不是准它自由發揮——原則沒有鬆動,只是來源變多。
 *
 * - get_now:時間來自伺服器時鐘(Asia/Taipei),不是模型算的
 * - get_weather:open-meteo 即時資料(免 API key);查不到就明講查不到,不猜
 * - emergency_info:固定的求救指引,由這個檔案寫死,不是模型生成的醫療建議
 */

const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'];

export function getNow(now = Date.now()): Record<string, unknown> {
  const d = new Date(now);
  const fmt = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', ...opts }).format(d);
  const date = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' });
  const time = new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
  const weekdayIdx = new Date(`${date}T12:00:00+08:00`).getDay();
  return { date, weekday: `星期${WEEKDAY[weekdayIdx]}`, time, timezone: 'Asia/Taipei' };
}

// ---------- 天氣 ----------

/**
 * 台灣 22 縣市座標。用固定表而不是每次打 geocoding API:
 * open-meteo 的中文地名查詢不穩(「台中」查無、「臺中市」才查得到),
 * 而查錯地點回一個看起來正常的天氣,正是最糟的失敗方式。
 * 表上沒有的地名一律回「查不到」,不猜、不模糊比對。
 */
const CITY_COORDS: Record<string, [number, number]> = {
  臺北市: [25.038, 121.5645],
  新北市: [25.0169, 121.4628],
  基隆市: [25.1276, 121.7392],
  桃園市: [24.9937, 121.301],
  新竹市: [24.8039, 120.9647],
  新竹縣: [24.8387, 121.0125],
  苗栗縣: [24.5602, 120.8214],
  臺中市: [24.1469, 120.6839],
  彰化縣: [24.0518, 120.5161],
  南投縣: [23.9609, 120.9719],
  雲林縣: [23.7092, 120.4313],
  嘉義市: [23.4801, 120.4491],
  嘉義縣: [23.4518, 120.2555],
  臺南市: [22.9999, 120.2269],
  高雄市: [22.6273, 120.3014],
  屏東縣: [22.5519, 120.5487],
  宜蘭縣: [24.7021, 121.7378],
  花蓮縣: [23.9871, 121.6015],
  臺東縣: [22.7583, 121.1444],
  澎湖縣: [23.5711, 119.5793],
  金門縣: [24.4321, 118.3171],
  連江縣: [26.1608, 119.9499],
};

const DEFAULT_CITY = '臺中市';

/** 「台中」→「臺中市」這類正規化。只做確定的轉換,對不上就是對不上 */
export function normalizeCity(input: string): string | null {
  const raw = input.trim().replace(/台/g, '臺');
  if (CITY_COORDS[raw]) return raw;
  for (const suffix of ['市', '縣']) {
    if (CITY_COORDS[raw + suffix]) return raw + suffix;
  }
  // 區級地名(豐原、北屯…)歸到所屬縣市會需要另一張表,現在沒有——
  // 與其亂猜,不如讓呼叫端明講「請給縣市」
  return null;
}

const WMO: Record<number, string> = {
  0: '晴朗',
  1: '大致晴朗',
  2: '多雲時晴',
  3: '陰天',
  45: '有霧',
  48: '霧淞',
  51: '毛毛雨',
  53: '小雨',
  55: '中雨',
  61: '小雨',
  63: '中雨',
  65: '大雨',
  71: '小雪',
  73: '中雪',
  75: '大雪',
  80: '陣雨',
  81: '較強陣雨',
  82: '強陣雨',
  95: '雷雨',
  96: '雷雨伴冰雹',
  99: '強雷雨伴冰雹',
};

export interface DailyToolResult {
  ok: boolean;
  data: Record<string, unknown>;
}

export async function getWeather(location?: string): Promise<DailyToolResult> {
  const requested = location?.trim() || DEFAULT_CITY;
  const city = normalizeCity(requested);
  if (!city) {
    return {
      ok: false,
      data: {
        error: 'LOCATION_UNKNOWN',
        message_zh: `查不到「${requested}」的天氣資料,請改講縣市(例如臺中市)`,
      },
    };
  }
  const [lat, lon] = CITY_COORDS[city];

  let res: Response;
  try {
    res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        '&current=temperature_2m,precipitation,weather_code' +
        '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code' +
        '&timezone=Asia%2FTaipei&forecast_days=2',
      { signal: AbortSignal.timeout(8000) },
    );
  } catch (e) {
    // 拿不到就明講拿不到,不讓模型退回「憑印象講個天氣」
    return {
      ok: false,
      data: {
        error: 'WEATHER_UNAVAILABLE',
        message_zh: `天氣服務連不上(${e instanceof Error ? e.message : String(e)}),現在查不到`,
      },
    };
  }
  if (!res.ok) {
    return { ok: false, data: { error: 'WEATHER_UNAVAILABLE', message_zh: `天氣服務回傳 HTTP ${res.status}` } };
  }

  const j = (await res.json()) as {
    current?: { temperature_2m?: number; precipitation?: number; weather_code?: number };
    daily?: {
      time?: string[];
      temperature_2m_max?: number[];
      temperature_2m_min?: number[];
      precipitation_probability_max?: number[];
      weather_code?: number[];
    };
  };

  const describe = (code?: number) => (code === undefined ? '不明' : (WMO[code] ?? `天氣碼 ${code}`));
  const daily = j.daily;
  const day = (i: number) => ({
    date: daily?.time?.[i] ?? null,
    high: daily?.temperature_2m_max?.[i] ?? null,
    low: daily?.temperature_2m_min?.[i] ?? null,
    rain_probability_percent: daily?.precipitation_probability_max?.[i] ?? null,
    condition: describe(daily?.weather_code?.[i]),
  });

  return {
    ok: true,
    data: {
      location: city,
      current: {
        temperature_c: j.current?.temperature_2m ?? null,
        precipitation_mm: j.current?.precipitation ?? null,
        condition: describe(j.current?.weather_code),
      },
      today: day(0),
      tomorrow: day(1),
      source: 'open-meteo.com',
    },
  };
}

// ---------- 救難 ----------

/**
 * 求救資訊一律寫死在這裡,不是模型生成的。
 * 理由:急救步驟講錯會出人命,而模型「聽起來很有道理但細節錯」正是它最擅長的事。
 * 這裡只放「叫救護車」等級的通報指引與最基本的現場處置,不寫進階醫療處置。
 */
export const EMERGENCY_INFO: Record<string, string> = {
  numbers:
    '緊急電話:救護車與消防 119;報警 110;手機沒訊號或不知道打哪支打 112(會轉接)。' +
    '海上/海岸事故 118。通報時先講「地點」(路名、門牌或最近的路口/地標)、' +
    '「發生什麼事」、「幾個人受傷」、「傷者現在的狀況」,講完不要先掛電話,等對方說可以掛。',
  electric_shock:
    '觸電:先切斷電源(拉總開關或跳電閘),不要徒手碰觸還在通電的人。' +
    '無法斷電就用乾燥的木棒、塑膠等絕緣物把電源移開。' +
    '人脫離電源後立刻打 119;沒有呼吸就開始 CPR,持續壓胸直到救護人員到。',
  fall:
    '墜落/摔傷:不要隨意搬動傷者,尤其是頭頸背部有疼痛或麻木時——移動可能造成永久傷害。' +
    '立刻打 119,保持傷者溫暖、持續跟他說話確認意識。有明顯出血就先壓迫止血。',
  bleeding:
    '大量出血:用乾淨布料直接壓迫傷口,持續用力壓不要一直放開看。' +
    '布濕透就再疊一層上去,不要把原本那層拿掉。傷肢可以抬高過心臟。立刻打 119。',
  heat_stroke:
    '中暑:立刻移到陰涼通風處,鬆開衣物,用水或濕毛巾降溫(頸部、腋下、鼠蹊)。' +
    '意識清楚才給水,不要強灌。出現意識不清、抽搐、不流汗但體溫很高 → 立刻打 119,這是熱中暑,會致命。',
  general:
    '現場有人受傷:先確認自己安全再靠近;立刻打 119;不要移動疑似脊椎受傷的人;' +
    '有出血先壓迫止血;沒有呼吸心跳就做 CPR 並持續到救護人員接手。',
};

/** 呼叫過救難工具的那一輪,回覆一律由系統補這句在最前面,不靠模型記得講 */
export const EMERGENCY_PREFIX = '🚨 緊急狀況請先打 119(手機也可直撥 112)。以下是基本處置:';

export function getEmergencyInfo(topic?: string): DailyToolResult {
  const key = topic && EMERGENCY_INFO[topic] ? topic : 'general';
  return { ok: true, data: { topic: key, guidance: EMERGENCY_INFO[key], numbers: EMERGENCY_INFO.numbers } };
}
