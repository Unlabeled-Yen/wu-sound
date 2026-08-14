import 'server-only';

// 標案監測三個頁面(資料進度板/標案監測/機關經營名單)各自重複寫一次「檢查環境變數
// 有沒有設定、呼叫外部服務、處理錯誤」的邏輯,抽成這裡共用一份。tender-radar 是
// 獨立於本 repo 的私有服務,這裡只負責呼叫,不含任何業務邏輯。

export interface TenderRadarResult<T> {
  data: T | null;
  error: string | null;
}

export async function fetchTenderRadar<T>(path: string): Promise<TenderRadarResult<T>> {
  const base = process.env.TENDER_RADAR_API_URL;
  const token = process.env.TENDER_RADAR_API_TOKEN;
  if (!base || !token) {
    return { data: null, error: '標案雷達連線尚未設定(缺 TENDER_RADAR_API_URL/TOKEN)' };
  }

  try {
    const res = await fetch(`${base}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) {
      return { data: null, error: `標案雷達回應異常:HTTP ${res.status}` };
    }
    const json = (await res.json()) as T;
    return { data: json, error: null };
  } catch (err) {
    return { data: null, error: `連線標案雷達失敗:${err instanceof Error ? err.message : String(err)}` };
  }
}
