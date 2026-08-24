'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AgentLogo, type AgentState } from '@/app/_shared/AgentLogo';

/**
 * 手機語音助理:AgentLogo 排版 + OpenAI Realtime 引擎(2026-08-24 Yen 定案)。
 *
 * 為什麼不是共用 ChatClient 換底層——ChatClient 的核心是「錄音一段→上傳
 * 辨識→丟給 LLM→顯示文字」這條批次管線;Realtime 是全雙工 WebRTC
 * 連線,連上就一直雙向對話直到掛斷,兩者的狀態機根本對不起來
 * (batch 有 recording/transcribing/thinking/responding,realtime 只有
 * disconnected/connected+model_state)。硬套只會兩邊都變形,拆一支反而乾淨。
 *
 * 硬化規則(跟 ChatClient / voice-lab-realtime 是同一份):
 * - 模型工具清單只有 propose_*,沒有 create_task / log_note / confirm
 * - 語音模式**不等口頭確認**,propose 拿到 token 後系統自己接著 commit
 *   (2026-08-24 Yen 定案:講完就寫,不要再問一次)
 * - propose 的 confirmation_token / canonical_echo 原封不動送回 commit
 * 見 lib/voice-realtime-tools.ts、docs voice-lab spec §4。
 *
 * 手勢設計(2026-08-24 Yen 定案):
 * - 輕點 logo = 開始/結束通話(接上就一直全雙工對話,不用一句一句按)
 * - 長按 logo = 這個模式下退化成跟輕點一樣,realtime 沒有「按著錄一句」
 *   的概念(那是傳統 batch 管線才有的手勢)。保留同一個手勢介面是為了
 *   讓 AgentLogo 元件一致,不用為 realtime 另開一個特例版本。
 */

const REALTIME_CALLS_URL = 'https://api.openai.com/v1/realtime/calls';

type ConnState = 'idle' | 'connecting' | 'connected' | 'error';
type ModelState = 'listening' | 'thinking' | 'responding';

function summarize(action: 'create_task' | 'log_note', payload: Record<string, unknown>): string {
  if (action === 'create_task') return `新增任務:${String(payload.title ?? '')}`;
  return `工作記錄:${String(payload.content ?? '')}`;
}

export function RealtimeVoiceClient() {
  const [connState, setConnState] = useState<ConnState>('idle');
  const [modelState, setModelState] = useState<ModelState>('listening');
  const [error, setError] = useState<string | null>(null);
  const [lastCaption, setLastCaption] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  function sendEvent(ev: Record<string, unknown>) {
    if (dcRef.current?.readyState === 'open') dcRef.current.send(JSON.stringify(ev));
  }

  function sendFunctionOutput(callId: string, output: unknown) {
    sendEvent({
      type: 'conversation.item.create',
      item: { type: 'function_call_output', call_id: callId, output: JSON.stringify(output) },
    });
    sendEvent({ type: 'response.create' });
  }

  /** 系統做完事之後,用一則 system 訊息告訴模型發生了什麼,讓它口頭跟使用者說一聲。
   *  這則訊息只是「轉告結果」,不是讓模型決定要不要寫入——寫入已經在這之前發生了。 */
  function tellModel(text: string) {
    sendEvent({
      type: 'conversation.item.create',
      item: { type: 'message', role: 'system', content: [{ type: 'input_text', text }] },
    });
    sendEvent({ type: 'response.create' });
  }

  async function callTool(tool: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/voice/tools/${tool}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, body: json as Record<string, unknown> };
  }

  async function handleFunctionCall(name: string, callId: string, argsJson: string) {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(argsJson);
    } catch {
      sendFunctionOutput(callId, { error_code: 'BAD_ARGS', message_zh: '參數不是有效的 JSON' });
      return;
    }

    if (name === 'search_projects' || name === 'list_projects' || name === 'get_project_summary' || name === 'list_tasks') {
      const result = await callTool(name, args);
      sendFunctionOutput(callId, result.body);
      return;
    }

    if (name === 'propose_create_task' || name === 'propose_log_note') {
      const action: 'create_task' | 'log_note' = name === 'propose_create_task' ? 'create_task' : 'log_note';
      const payload =
        action === 'create_task'
          ? { project_id: args.project_id, title: args.title, description: args.description, due_date: args.due_date }
          : { project_id: args.project_id, content: args.content, tags: args.tags };

      // 2026-08-24 Yen 定案:語音模式不等使用者口頭確認,講完直接寫入。
      // 兩階段 token 的機制**保留不動**(propose 拿 token → commit 帶 token),
      // 只是「誰按下確認」從使用者變成系統自己接著按——payload hash 驗證、
      // 稽核紀錄、canonical echo 這些防護都還在,拿掉的只有那句口頭確認。
      //
      // 這樣做順便根治了「AI 說謊」那個事故:寫入結果直接當成工具的回傳值
      // 餵回模型,它是拿到真實結果才開口,不像之前那樣自己猜一句「記好了」。
      setWriting(true);
      const proposed = await callTool('propose_write', { action, payload });
      if (!proposed.ok) {
        setWriting(false);
        sendFunctionOutput(callId, proposed.body);
        return;
      }
      const token = String(proposed.body.confirmation_token ?? '');
      const written = await callTool(action, { confirmation_token: token, ...payload });
      setWriting(false);
      const summary = summarize(action, payload);
      if (written.ok) {
        setLastCaption(`已寫入:${summary}`);
        sendFunctionOutput(callId, { written: true, summary });
      } else {
        const msg = String(written.body.message_zh ?? '未知錯誤');
        setLastCaption(`寫入失敗:${msg}`);
        sendFunctionOutput(callId, { written: false, error_zh: msg });
      }
      return;
    }

    // 工具清單新增了但這裡忘了接的話,靜默 return 會讓 model 一直等不到結果、
    // 對話卡死且沒有任何線索。留一句 warn 讓它至少在 console 現形。
    console.warn('[realtime] 收到沒有對應處理的工具呼叫:', name);
  }

  function onServerEvent(e: MessageEvent) {
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(e.data);
    } catch {
      return;
    }

    // 光暈狀態機映射(見檔頭手勢設計):logo 狀態由 realtime 事件推,
    // 不由本地計時器猜——事件收到什麼就是什麼,才不會跟實際模型行為對不上。
    if (event.type === 'input_audio_buffer.speech_started') setModelState('listening');
    if (event.type === 'response.created') setModelState('thinking');
    if (event.type === 'response.output_audio.delta') setModelState('responding');
    if (event.type === 'response.done') {
      setModelState('listening');
      const output = ((event.response as Record<string, unknown> | undefined)?.output ?? []) as Array<Record<string, unknown>>;
      const calls = output.filter((item) => item.type === 'function_call');
      for (const item of calls) {
        void handleFunctionCall(String(item.name), String(item.call_id), String(item.arguments ?? '{}'));
      }
    }

    if (event.type === 'conversation.item.input_audio_transcription.completed') {
      setLastCaption(`你:${String(event.transcript ?? '')}`);
    }

    if (event.type === 'response.output_audio_transcript.done') {
      setLastCaption(`AI:${String(event.transcript ?? '')}`);
    }

    if (event.type === 'error') {
      const err = event.error as Record<string, unknown> | undefined;
      setError(String(err?.message ?? '發生錯誤'));
    }
  }

  const start = useCallback(async () => {
    setError(null);
    setConnState('connecting');
    setModelState('listening');
    setLastCaption(null);
    try {
      const sessionRes = await fetch('/api/voice-lab/realtime-session', { method: 'POST' });
      const sessionJson = await sessionRes.json();
      if (!sessionRes.ok) throw new Error(sessionJson.error || '無法建立語音連線');
      const ephemeralKey = String(sessionJson.value ?? '');
      if (!ephemeralKey) throw new Error('伺服器沒有回傳有效的語音憑證');

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      if (!audioElRef.current) {
        audioElRef.current = document.createElement('audio');
        audioElRef.current.autoplay = true;
      }
      pc.ontrack = (ev) => {
        if (audioElRef.current) audioElRef.current.srcObject = ev.streams[0];
      };

      const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = ms;
      ms.getTracks().forEach((t) => pc.addTrack(t, ms));

      const dc = pc.createDataChannel('oai-events');
      dcRef.current = dc;
      dc.addEventListener('message', onServerEvent);
      dc.addEventListener('open', () => setConnState('connected'));
      dc.addEventListener('close', () => setConnState('idle'));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpRes = await fetch(REALTIME_CALLS_URL, {
        method: 'POST',
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          'Content-Type': 'application/sdp',
        },
      });
      if (!sdpRes.ok) {
        // 拿到 OpenAI 實際回的錯誤內容,不要只吐 status code——2026-08-24 真機
        // 遇到 403 時吃了三次啞巴虧,單看 status 分不出是 model 沒開通、key 沒
        // 權限,還是連線本身被擋。多印一句話值得。
        const detail = await sdpRes.text().catch(() => '');
        throw new Error(`語音連線協商失敗(HTTP ${sdpRes.status}):${detail.slice(0, 300)}`);
      }
      const answerSdp = await sdpRes.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
    } catch (e) {
      setConnState('error');
      setError(e instanceof Error ? e.message : '連線失敗');
      stop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stop = useCallback(() => {
    dcRef.current?.close();
    dcRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    setWriting(false);
    setConnState((s) => (s === 'error' ? 'error' : 'idle'));
  }, []);

  // 卸載時務必掛斷,不然使用者切走頁面 realtime 連線還會繼續燒 API 費用
  useEffect(() => {
    return () => stop();
  }, [stop]);

  // logo 狀態機:沒連線=idle;連線中=接 realtime 事件驅動的 modelState;
  // writing=真的在寫資料庫(綠色光暈),跟一般對話明確區隔——不等確認之後,
  // 這是使用者唯一能看出「剛剛那句話真的動到資料了」的視覺訊號。
  const logoState: AgentState =
    connState !== 'connected' ? 'idle' : writing ? 'executing' : modelState;

  const label =
    connState === 'connecting'
      ? '連線中…'
      : connState === 'connected'
        ? writing
          ? '寫入中…'
          : modelState === 'thinking'
            ? '整理中…'
            : modelState === 'responding'
              ? '回覆中'
              : '通話中,直接開口說'
        : '輕點 logo 開始語音對答';

  function handleTap() {
    if (connState === 'connecting') return; // 連線中不要接受重複點擊
    if (connState === 'connected') stop();
    else void start();
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 max-w-[720px] w-full mx-auto lg:px-[22px]">
      <div className="flex-1 flex flex-col items-center justify-center px-[18px] gap-4 pb-16">
        <AgentLogo
          state={logoState}
          label={label}
          // realtime 沒有「按著錄一句」的概念,長按退化成跟輕點一樣,
          // 不要讓使用者以為長按會有不同行為(2026-08-24 定案)
          onTap={handleTap}
          onHoldStart={() => {}}
          onHoldEnd={handleTap}
        />

        {error && (
          <div
            className="text-[13px] rounded-xl px-3 py-2 max-w-[320px] text-center"
            style={{ color: 'var(--nm-danger)', background: 'rgba(224,122,122,0.08)' }}
          >
            {error}
          </div>
        )}

        {lastCaption && !error && (
          <div className="text-[12px] max-w-[320px] text-center" style={{ color: 'var(--nm-text-faint)' }}>
            {lastCaption}
          </div>
        )}
      </div>
    </div>
  );
}
