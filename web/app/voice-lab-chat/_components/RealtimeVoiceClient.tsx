'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AgentLogo, type AgentState } from '@/app/_shared/AgentLogo';
import { matchVoiceCommand } from '@/lib/voice-command-match';

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
 * - 「確認/取消」是 matchVoiceCommand 白名單比對,不是讓模型自己判斷
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

interface PendingWrite {
  action: 'create_task' | 'log_note';
  token: string;
  payload: Record<string, unknown>;
  summary: string;
}

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
  const [pending, setPending] = useState<PendingWrite | null>(null);
  const [lastCaption, setLastCaption] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pendingRef = useRef<PendingWrite | null>(null);
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

      const result = await callTool('propose_write', { action, payload });
      if (!result.ok) {
        sendFunctionOutput(callId, result.body);
        return;
      }
      const token = String(result.body.confirmation_token ?? '');
      const p: PendingWrite = { action, token, payload, summary: summarize(action, payload) };
      pendingRef.current = p;
      setPending(p);
      sendFunctionOutput(callId, { proposed: true, echo: result.body.canonical_echo });
      return;
    }

    // 工具清單新增了但這裡忘了接的話,靜默 return 會讓 model 一直等不到結果、
    // 對話卡死且沒有任何線索。留一句 warn 讓它至少在 console 現形。
    console.warn('[realtime] 收到沒有對應處理的工具呼叫:', name);
  }

  async function tryConfirmOrCancel(transcript: string) {
    const p = pendingRef.current;
    if (!p) return;
    const cmd = matchVoiceCommand(transcript);
    if (cmd === 'confirm') {
      const result = await callTool(p.action, { confirmation_token: p.token, ...p.payload });
      pendingRef.current = null;
      setPending(null);
      if (result.ok) {
        tellModel('系統剛剛已經確認並寫入完成,請用一句話跟使用者說已經記好了,不用重複內容細節。');
      } else {
        const msg = String(result.body.message_zh ?? '未知錯誤');
        tellModel(`剛才的寫入失敗了(${msg}),跟使用者說一下,問要不要重試。`);
      }
      return;
    }
    if (cmd === 'cancel') {
      pendingRef.current = null;
      setPending(null);
      tellModel('使用者取消了剛才的提案,跟使用者說一聲沒問題,不用重複提案內容,也不用再問一次。');
    }
    // unclear:什麼都不做,維持 pending,等使用者再講清楚一點
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
      const transcript = String(event.transcript ?? '');
      setLastCaption(`你:${transcript}`);
      void tryConfirmOrCancel(transcript);
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
    pendingRef.current = null;
    setPending(null);
    setConnState((s) => (s === 'error' ? 'error' : 'idle'));
  }, []);

  // 卸載時務必掛斷,不然使用者切走頁面 realtime 連線還會繼續燒 API 費用
  useEffect(() => {
    return () => stop();
  }, [stop]);

  // logo 狀態機:沒連線=idle;連線中=接 realtime 事件驅動的 modelState;
  // 有 pending 提案(等你講「確認」)= executing——這是需要使用者做決定的時刻,
  // 用綠色光暈明確跟一般對話區隔。
  const logoState: AgentState =
    connState !== 'connected' ? 'idle' : pending ? 'executing' : modelState;

  const label =
    connState === 'connecting'
      ? '連線中…'
      : connState === 'connected'
        ? pending
          ? '講「確認」寫入,或「取消」撤銷'
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
