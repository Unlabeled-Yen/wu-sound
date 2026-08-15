import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { todayInTaipei } from '@/lib/voice-agent';
import { realtimeToolDefs } from '@/lib/voice-realtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Lab 3c:發 Realtime 短效金鑰(spec §1),session 內建工具面(spec §3)。
 *
 * 正式 OPENAI_API_KEY 只存在這裡,前端拿到的是幾分鐘就過期的短效金鑰。
 * 模型名稱不寫死——白名單裡有哪個 realtime 模型就用哪個(偏好 mini),
 * 沒有就 loud 503 講清楚要去開白名單,不猜、不靜默。
 *
 * instructions 是軟性約束(spec §2:嘴巴放開)——寫入防線不靠這段文字,
 * 靠的是工具清單裡只有 propose_*、commit 只存在於 /api/voice-live/tool 的伺服器比對。
 */

function buildRealtimeInstructions(): string {
  return `你是 wu 音響工程公司的現場語音助理,全程用繁體中文與台灣慣用語,回答簡短口語,一次不要講超過三句。
規則:
1. 使用者問專案、任務、工作記錄,一定先呼叫工具查了再答,不可以憑印象回答;查不到就直說查不到。
2. project_id 一律來自 search_projects 的回傳結果,絕對不能自己編。
3. 使用者要記錄事情:先 search_projects 對齊專案。結果 2 筆以上就呼叫 ask_clarification 列出候選讓他選;1 筆就採用但要唸出完整案名;0 筆就說找不到。
4. 對齊專案後呼叫 propose_create_task 或 propose_log_note。呼叫完那筆東西**還沒寫入**:口語複述欄位讓他核對,語氣是「要記到某某專案:…,對嗎?」,絕對不能說「已經記了」。
5. 他說「確認」之後系統會自己寫入並把結果告訴你——你不用也不可以自行判斷他是否同意。聽到「確認」「取消」這類話,簡短回應「好」就好,等系統結果。
6. 口語相對日期(下週三、月底前)自己換算成 YYYY-MM-DD 再放進 payload;今天是 ${todayInTaipei(Date.now())},時區 Asia/Taipei。
7. 不支援的操作(改資料、刪除、查金額、建新專案)直接說目前不支援,請用系統介面,不要假裝做了。
8. 金額等敏感數字不要唸出來。跟工作無關的閒聊,簡短帶回工作:「我是現場記錄助理,有什麼要記的嗎?」`;
}
export async function POST() {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: '缺 OPENAI_API_KEY' }, { status: 503 });
  }

  // 白名單裡挑 realtime 模型:偏好 mini(便宜三倍),env 可覆寫
  let model = process.env.VOICE_REALTIME_MODEL;
  if (!model) {
    const listRes = await fetch('https://api.openai.com/v1/models', {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    if (!listRes.ok) {
      return NextResponse.json(
        { error: `查詢模型清單失敗(HTTP ${listRes.status})` },
        { status: 502 },
      );
    }
    const list = (await listRes.json()) as { data?: { id: string }[] };
    const realtime = (list.data ?? []).map((m) => m.id).filter((id) => /realtime/.test(id));
    model = realtime.find((id) => /mini/.test(id)) ?? realtime[0];
    if (!model) {
      return NextResponse.json(
        {
          error:
            '這個 OpenAI project 的白名單還沒開任何 realtime 模型。' +
            '請到 platform.openai.com → project limits 勾 gpt-realtime 系列(mini 優先)。',
          error_code: 'NO_REALTIME_MODEL',
        },
        { status: 503 },
      );
    }
  }

  const res = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      expires_after: { anchor: 'created_at', seconds: 600 },
      session: {
        type: 'realtime',
        model,
        instructions: buildRealtimeInstructions(),
        // 工具面:6 個(read 3 + ask_clarification + propose 2),沒有 create_task/log_note——
        // 模型只能提案,寫入的唯一入口在 /api/voice-live/tool 的伺服器端確認比對
        tools: realtimeToolDefs(),
        tool_choice: 'auto',
        audio: {
          input: {
            // 逐字稿兩個用途:伺服器端口令比對(確認/取消)、稽核回溯
            transcription: { model: 'gpt-4o-transcribe', language: 'zh' },
          },
        },
      },
    }),
  });

  const body = await res.text();
  if (!res.ok) {
    // OpenAI 的錯誤原文直接回給前端顯示——第一次接新 API,錯誤訊息就是除錯地圖
    return NextResponse.json(
      { error: `client_secrets 失敗(HTTP ${res.status}):${body.slice(0, 500)}`, model },
      { status: 502 },
    );
  }

  const json = JSON.parse(body) as { value?: string; expires_at?: number };
  if (!json.value) {
    return NextResponse.json({ error: `回應缺 value 欄位:${body.slice(0, 300)}` }, { status: 502 });
  }
  return NextResponse.json({ ok: true, client_secret: json.value, model, expires_at: json.expires_at });
}
