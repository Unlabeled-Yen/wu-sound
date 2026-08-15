'use client';

import { useCallback, useRef, useState } from 'react';
import { matchVoiceCommand } from '@/lib/voice-command-match';

/**
 * OpenAI Realtime API(WebRTC)語音客戶端。取代 Lab 2 的「錄音→轉文字→丟給
 * Claude/Kimi agent→瀏覽器 TTS 唸出來」批次流程,語音直接對話、直接呼叫工具。
 *
 * 跟 Lab 2 共用同一條安全鐵律,只是換了實作方式:
 * - 模型的工具清單裡沒有 create_task / log_note / confirm / cancel,只有
 *   propose_create_task / propose_log_note(見 lib/voice-realtime-tools.ts)。
 * - 真正的確認由這支元件對「使用者語音轉出的文字」做關鍵字比對
 *   (matchVoiceCommand,跟 Lab 2 語音口令共用同一份詞表),不是讓模型自己
 *   判斷「聽起來像不像在同意」——模型連嘗試的工具都沒有。
 */

const REALTIME_CALLS_URL = 'https://api.openai.com/v1/realtime/calls';

interface PendingWrite {
  action: 'create_task' | 'log_note';
  token: string;
  payload: Record<string, unknown>;
  summary: string;
}

interface LogEntry {
  id: number;
  role: 'user' | 'assistant' | 'system';
  text: string;
}

type ConnState = 'idle' | 'connecting' | 'connected' | 'error';

function summarize(action: 'create_task' | 'log_note', payload: Record<string, unknown>): string {
  if (action === 'create_task') return `新增任務:${String(payload.title ?? '')}`;
  return `工作記錄:${String(payload.content ?? '')}`;
}

export function RealtimeClient() {
  const [connState, setConnState] = useState<ConnState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [pending, setPending] = useState<PendingWrite | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pendingRef = useRef<PendingWrite | null>(null);
  const nextId = useRef(1);

  const appendLog = useCallback((role: LogEntry['role'], text: string) => {
    if (!text) return;
    setLog((l) => [...l, { id: nextId.current++, role, text }]);
  }, []);

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

  /** 系統做完事之後,用一則 system 訊息告訴模型發生了什麼,讓它口頭跟使用者說一聲——
   *  這則訊息只是「轉告結果」,不是讓模型決定要不要寫入,寫入已經在這之前發生了。 */
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

    if (name === 'search_projects' || name === 'get_project_summary' || name === 'list_tasks') {
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
        appendLog('system', `已確認寫入:${p.summary}`);
        tellModel('系統剛剛已經確認並寫入完成,請用一句話跟使用者說已經記好了,不用重複內容細節。');
      } else {
        const msg = String(result.body.message_zh ?? '未知錯誤');
        appendLog('system', `寫入失敗:${msg}`);
        tellModel(`剛才的寫入失敗了(${msg}),跟使用者說一下,問要不要重試。`);
      }
      return;
    }
    if (cmd === 'cancel') {
      pendingRef.current = null;
      setPending(null);
      appendLog('system', `已取消:${p.summary}`);
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

    if (event.type === 'response.done') {
      const output = ((event.response as Record<string, unknown> | undefined)?.output ?? []) as Array<Record<string, unknown>>;
      for (const item of output) {
        if (item.type === 'function_call') {
          void handleFunctionCall(String(item.name), String(item.call_id), String(item.arguments ?? '{}'));
        }
      }
    }

    if (event.type === 'conversation.item.input_audio_transcription.completed') {
      const transcript = String(event.transcript ?? '');
      appendLog('user', transcript);
      void tryConfirmOrCancel(transcript);
    }

    if (event.type === 'response.output_audio_transcript.done') {
      appendLog('assistant', String(event.transcript ?? ''));
    }

    if (event.type === 'error') {
      const err = event.error as Record<string, unknown> | undefined;
      setError(String(err?.message ?? '發生錯誤'));
    }
  }

  async function start() {
    setError(null);
    setConnState('connecting');
    try {
      const sessionRes = await fetch('/api/voice-lab/realtime-session', { method: 'POST' });
      const sessionJson = await sessionRes.json();
      if (!sessionRes.ok) throw new Error(sessionJson.error || '無法建立語音連線');
      const ephemeralKey = String(sessionJson.value ?? '');
      if (!ephemeralKey) throw new Error('伺服器沒有回傳有效的語音憑證');

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      const audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      pc.ontrack = (ev) => {
        audioEl.srcObject = ev.streams[0];
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
      if (!sdpRes.ok) throw new Error(`語音連線協商失敗(HTTP ${sdpRes.status})`);
      const answerSdp = await sdpRes.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
    } catch (e) {
      setConnState('error');
      setError(e instanceof Error ? e.message : '連線失敗');
      stop();
    }
  }

  function stop() {
    dcRef.current?.close();
    dcRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    pendingRef.current = null;
    setPending(null);
    setConnState((s) => (s === 'error' ? 'error' : 'idle'));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        {connState !== 'connected' ? (
          <button
            type="button"
            onClick={start}
            disabled={connState === 'connecting'}
            className="nm-btn-solid text-[14px] nm-focus"
          >
            {connState === 'connecting' ? '連線中…' : '開始語音通話'}
          </button>
        ) : (
          <button type="button" onClick={stop} className="nm-btn text-[14px] nm-focus" style={{ color: 'var(--nm-danger)' }}>
            結束通話
          </button>
        )}
        <span className="text-[12px]" style={{ color: 'var(--nm-text-faint)' }}>
          {connState === 'connected' ? '通話中,直接開口說話' : connState === 'connecting' ? '連線中…' : '尚未連線'}
        </span>
      </div>

      {error && (
        <div className="nm-inset rounded-xl p-3 text-[13px]" style={{ color: 'var(--nm-danger)' }}>{error}</div>
      )}

      {pending && (
        <div
          className="rounded-2xl p-4"
          style={{ background: 'rgba(217,181,107,0.08)', border: '1px solid rgba(217,181,107,0.28)' }}
        >
          <div className="text-[13px] font-medium mb-1" style={{ color: 'var(--nm-warning-glass-text)' }}>等你確認</div>
          <div className="text-[14px]" style={{ color: 'var(--nm-text-body)' }}>{pending.summary}</div>
          <div className="text-[12px] mt-2" style={{ color: 'var(--nm-text-faint)' }}>
            講「對」「確認」或「好」才會寫入;講「取消」或「不對」會撤銷。
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {log.map((entry) => (
          <div
            key={entry.id}
            className="rounded-xl px-3 py-2 text-[13px]"
            style={{
              alignSelf: entry.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              background: entry.role === 'user' ? 'rgba(255,255,255,0.08)' : entry.role === 'system' ? 'rgba(126,207,157,0.1)' : 'rgba(255,255,255,0.04)',
              color: entry.role === 'system' ? 'var(--nm-success-glass-text)' : 'var(--nm-text-body)',
            }}
          >
            {entry.text}
          </div>
        ))}
      </div>
    </div>
  );
}
