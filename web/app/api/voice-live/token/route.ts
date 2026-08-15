import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Lab 3c 最小可行性驗證:發 Realtime 短效金鑰。
 * 規格:voice-lab/lab3c-realtime-spec-v1.md §1
 *
 * 正式 OPENAI_API_KEY 只存在這裡,前端拿到的是幾分鐘就過期的短效金鑰。
 * 模型名稱不寫死——白名單裡有哪個 realtime 模型就用哪個(偏好 mini),
 * 沒有就 loud 503 講清楚要去開白名單,不猜、不靜默。
 */
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
        // 最小驗證:先不接工具,只驗「講得順不順」。工具整合是下一步。
        instructions:
          '你是台灣音響工程公司的現場語音助理,全程用繁體中文與台灣慣用語對話,回答簡短口語。' +
          '這是連線測試,使用者會隨意跟你聊,自然回應即可。',
        audio: {
          input: {
            // 逐字稿之後要做伺服器端口令比對與稽核,驗證階段先開起來看品質
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
