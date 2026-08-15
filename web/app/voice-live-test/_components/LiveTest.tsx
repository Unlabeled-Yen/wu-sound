'use client';

import { useEffect, useRef, useState } from 'react';
import { useAssistantReturn } from '@/app/_shared/useAssistantShortcut';

/**
 * Realtime 語音客戶端(spec §1 連線流程 + §3 工具面 + §4 語音確認)。
 *
 * 流程:跟自家後端拿短效金鑰 → WebRTC 直連 OpenAI → 麥克風上行、遠端音訊自動播放、
 * data channel "oai-events" 收事件。
 *
 * 這個元件的角色是**傳話筒**,不做任何判斷:
 * - 模型的 function_call → 轉發 /api/voice-live/tool → 結果塞回對話
 * - 使用者逐字稿在有待確認提案時 → 轉發伺服器做白名單口令比對
 * 寫入與否完全由伺服器決定;這裡看得到的只有結果。
 */

interface LogLine {
  id: number;
  who: 'you' | 'ai' | 'sys' | 'tool';
  text: string;
}

interface PendingCard {
  action: 'create_task' | 'log_note';
  fields: { label: string; value: string }[];
}

interface ClarifyCard {
  question: string;
  options: { label: string; value: string }[];
}

export function LiveTest() {
  useAssistantReturn();
  const [status, setStatus] = useState<'idle' | 'connecting' | 'live' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState('');
  const [lines, setLines] = useState<LogLine[]>([]);
  const [pending, setPending] = useState<PendingCard | null>(null);
  const [clarify, setClarify] = useState<ClarifyCard | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const nextId = useRef(1);
  const aiLineRef = useRef<number | null>(null);
  const sessionIdRef = useRef('');
  // 事件 handler 是閉包,讀 state 會讀到舊值——pending 狀態用 ref 鏡像
  const pendingRef = useRef<PendingCard | null>(null);
  // response.create 不能在模型還在講話時送(API 會報 active response 錯誤),排隊等 response.done
  const respActiveRef = useRef(false);
  const wantResponseRef = useRef(false);

  function push(who: LogLine['who'], text: string): number {
    const id = nextId.current++;
    setLines((prev) => [...prev.slice(-80), { id, who, text }]);
    return id;
  }
  function appendAi(delta: string) {
    setLines((prev) => {
      if (aiLineRef.current !== null) {
        const idx = prev.findIndex((l) => l.id === aiLineRef.current);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = { ...copy[idx], text: copy[idx].text + delta };
          return copy;
        }
      }
      const id = nextId.current++;
      aiLineRef.current = id;
      return [...prev.slice(-80), { id, who: 'ai' as const, text: delta }];
    });
  }

  function setPendingBoth(v: PendingCard | null) {
    pendingRef.current = v;
    setPending(v);
  }

  function dcSend(payload: Record<string, unknown>) {
    const dc = dcRef.current;
    if (dc && dc.readyState === 'open') dc.send(JSON.stringify(payload));
  }

  /** 要求模型接著講。若它還在講,記下來等 response.done 再送,不硬塞。 */
  function requestResponse() {
    if (respActiveRef.current) {
      wantResponseRef.current = true;
    } else {
      dcSend({ type: 'response.create' });
    }
  }

  /** 把系統事實塞進對話(例如「已寫入」),讓模型口播——它自己講不算數,寫入早已由伺服器完成 */
  function injectSystem(text: string) {
    dcSend({
      type: 'conversation.item.create',
      item: { type: 'message', role: 'system', content: [{ type: 'input_text', text }] },
    });
    requestResponse();
  }

  async function callToolEndpoint(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await fetch('/api/voice-live/tool', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session_id: sessionIdRef.current, ...payload }),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new Error(String(json.error ?? `HTTP ${res.status}`));
    return json;
  }

  /** 模型的工具呼叫:轉發後端 → function_call_output 回填 → 請模型繼續講 */
  async function handleFunctionCall(item: { name: string; call_id: string; arguments?: string }) {
    push('tool', `⚙ ${item.name}`);
    setClarify(null);
    let args: Record<string, unknown> = {};
    try {
      args = item.arguments ? (JSON.parse(item.arguments) as Record<string, unknown>) : {};
    } catch {
      // 參數壞掉不猜——把錯誤回給模型讓它重試,不用預設值執行
      dcSend({
        type: 'conversation.item.create',
        item: { type: 'function_call_output', call_id: item.call_id, output: JSON.stringify({ error_code: 'BAD_ARGS', message_zh: '工具參數不是合法 JSON,請重新呼叫' }) },
      });
      requestResponse();
      return;
    }

    let output: string;
    try {
      const res = await callToolEndpoint({ action: 'tool', name: item.name, args });
      output = typeof res.output === 'string' ? res.output : JSON.stringify({});
      const p = res.pending as PendingCard | undefined;
      if (p) setPendingBoth(p);
      const c = res.clarify as ClarifyCard | undefined;
      if (c && c.options.length > 0) setClarify(c);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      push('sys', `工具執行失敗:${msg}`);
      output = JSON.stringify({ error_code: 'TOOL_FAILED', message_zh: msg });
    }

    dcSend({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: item.call_id, output } });
    requestResponse();
  }

  /** 確認/取消的結果套用(語音口令與螢幕按鈕共用同一條出口) */
  function applyCommandResult(res: Record<string, unknown>) {
    const outcome = String(res.outcome ?? '');
    const reply = String(res.reply ?? '');
    if (res.warning) push('sys', `⚠ ${String(res.warning)}`);

    if (outcome === 'confirmed') {
      setPendingBoth(null);
      push('sys', `✅ ${reply}`);
      injectSystem(`[系統] ${reply} 寫入已完成,請口頭簡短告知使用者。`);
    } else if (outcome === 'failed') {
      setPendingBoth(null);
      push('sys', `❌ ${reply}`);
      injectSystem(`[系統] 寫入失敗,沒有記錄任何東西:${reply}。請如實告知使用者,不要說已經記了。`);
    } else if (outcome === 'cancelled') {
      setPendingBoth(null);
      push('sys', `已取消,沒有寫入任何東西。`);
      injectSystem('[系統] 使用者取消了提案,沒有寫入任何東西。請簡短回應即可。');
    } else if (outcome === 'unclear') {
      // 沒比對到確認詞:提案原地保留,提示口令。已知簡化:講別的內容也會停在這裡,
      // 想換話題請先說「取消」(Lab 2 的「新訊息作廢提案」在語音流暫不套用)
      push('sys', '沒聽清楚——要寫入請說「確認」,不要的話請說「取消」。');
    }
  }

  async function sendCommand(payload: Record<string, unknown>) {
    try {
      applyCommandResult(await callToolEndpoint(payload));
    } catch (e) {
      push('sys', `確認流程失敗:${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function connect() {
    setStatus('connecting');
    setError(null);
    sessionIdRef.current = crypto.randomUUID();
    setPendingBoth(null);
    setClarify(null);
    try {
      const tokenRes = await fetch('/api/voice-live/token', { method: 'POST' });
      const token = (await tokenRes.json()) as Record<string, unknown>;
      if (!tokenRes.ok) throw new Error(String(token.error ?? `token HTTP ${tokenRes.status}`));
      setModel(String(token.model ?? ''));

      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });

      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      for (const track of mic.getTracks()) pc.addTrack(track, mic);
      pc.ontrack = (e) => {
        if (audioRef.current) audioRef.current.srcObject = e.streams[0];
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          push('sys', `連線狀態:${pc.connectionState}`);
          setStatus('error');
          setError('WebRTC 連線中斷,請重新連線');
        }
      };

      const dc = pc.createDataChannel('oai-events');
      dcRef.current = dc;
      dc.onmessage = (e) => {
        try {
          const ev = JSON.parse(e.data) as Record<string, unknown>;
          const type = String(ev.type ?? '');
          if (type === 'response.created') {
            respActiveRef.current = true;
          } else if (type === 'response.done') {
            respActiveRef.current = false;
            if (wantResponseRef.current) {
              wantResponseRef.current = false;
              dcSend({ type: 'response.create' });
            }
          } else if (type === 'conversation.item.input_audio_transcription.completed') {
            const transcript = String(ev.transcript ?? '').trim();
            if (transcript) push('you', transcript);
            // 有待確認提案時,每句話都送伺服器比對口令——判斷在伺服器,不在模型也不在這裡
            if (transcript && pendingRef.current) void sendCommand({ action: 'voice_command', transcript });
          } else if (type === 'response.output_item.done') {
            const item = ev.item as { type?: string; name?: string; call_id?: string; arguments?: string } | undefined;
            if (item?.type === 'function_call' && item.name && item.call_id) {
              void handleFunctionCall({ name: item.name, call_id: item.call_id, arguments: item.arguments });
            }
          } else if (type === 'response.output_audio_transcript.delta') {
            appendAi(String(ev.delta ?? ''));
          } else if (type === 'response.output_audio_transcript.done') {
            aiLineRef.current = null;
          } else if (type === 'error') {
            push('sys', `API 錯誤:${JSON.stringify(ev.error ?? ev).slice(0, 300)}`);
          }
        } catch {
          /* 非 JSON 事件忽略 */
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpRes = await fetch(
        `https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(String(token.model))}`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${String(token.client_secret)}`,
            'content-type': 'application/sdp',
          },
          body: offer.sdp,
        },
      );
      if (!sdpRes.ok) {
        throw new Error(`SDP 交換失敗(HTTP ${sdpRes.status}):${(await sdpRes.text()).slice(0, 300)}`);
      }
      await pc.setRemoteDescription({ type: 'answer', sdp: await sdpRes.text() });

      setStatus('live');
      push('sys', `已連線(${String(token.model)}),直接開口講話。查詢、記錄都可以,寫入前會先跟你確認。`);
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : String(e));
      disconnect(false);
    }
  }

  function disconnect(resetStatus = true) {
    pcRef.current?.getSenders().forEach((s) => s.track?.stop());
    pcRef.current?.close();
    pcRef.current = null;
    dcRef.current = null;
    respActiveRef.current = false;
    wantResponseRef.current = false;
    setPendingBoth(null);
    setClarify(null);
    if (resetStatus) {
      setStatus('idle');
      push('sys', '已掛斷');
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => disconnect(false), []);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        {status !== 'live' ? (
          <button type="button" className="nm-btn-solid text-[14px]" disabled={status === 'connecting'} onClick={() => void connect()}>
            {status === 'connecting' ? '連線中…' : '🎙 開始通話'}
          </button>
        ) : (
          <button type="button" className="nm-btn text-[14px]" onClick={() => disconnect()}>
            ⏹ 掛斷
          </button>
        )}
        <span className="text-[12px]" style={{ color: status === 'live' ? 'var(--nm-accent)' : 'var(--nm-text-faint)' }}>
          {status === 'live' ? `● 通話中 · ${model}` : status === 'connecting' ? '建立連線…' : status === 'error' ? '發生錯誤' : '未連線'}
        </span>
      </div>

      {error && (
        <p className="text-[12px] whitespace-pre-wrap" style={{ color: '#ff8f8f' }}>
          {error}
        </p>
      )}

      <audio ref={audioRef} autoPlay />

      {pending && (
        <div className="nm-inset rounded-[var(--nm-radius)] p-4 flex flex-col gap-2" style={{ border: '1.5px solid var(--nm-accent)' }}>
          <p className="text-[13px] font-bold" style={{ color: 'var(--nm-accent)' }}>
            ⏳ 還沒寫入,請確認(說「確認」/「取消」,或按按鈕)
          </p>
          {pending.fields.map((f) => (
            <p key={f.label} className="text-[13px]">
              <span style={{ color: 'var(--nm-text-faint)' }}>{f.label}:</span>
              {f.value}
            </p>
          ))}
          <div className="flex gap-2 mt-1">
            <button type="button" className="nm-btn-solid text-[13px]" onClick={() => void sendCommand({ action: 'confirm' })}>
              ✓ 確認寫入
            </button>
            <button type="button" className="nm-btn text-[13px]" onClick={() => void sendCommand({ action: 'cancel' })}>
              ✕ 取消
            </button>
          </div>
        </div>
      )}

      {clarify && (
        <div className="nm-inset rounded-[var(--nm-radius)] p-4 flex flex-col gap-2">
          <p className="text-[13px]">{clarify.question}</p>
          <div className="flex flex-wrap gap-2">
            {clarify.options.map((o) => (
              <button
                key={o.value}
                type="button"
                className="nm-btn text-[13px]"
                onClick={() => {
                  setClarify(null);
                  dcSend({
                    type: 'conversation.item.create',
                    item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: `我選「${o.label}」` }] },
                  });
                  requestResponse();
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="nm-raised rounded-[var(--nm-radius)] p-4 min-h-[300px] flex flex-col gap-2">
        {lines.length === 0 && (
          <p className="text-[13px]" style={{ color: 'var(--nm-text-faint)' }}>
            連線後,你講的話與它的回覆會即時顯示在這裡(音訊為主,文字是逐字稿);工具呼叫以灰字標示
          </p>
        )}
        {lines.map((l) => (
          <p
            key={l.id}
            className={`text-[13px] leading-relaxed ${l.who === 'you' ? 'self-end text-right' : ''}`}
            style={{ color: l.who === 'sys' || l.who === 'tool' ? 'var(--nm-text-faint)' : 'var(--nm-text-primary)' }}
          >
            {l.who === 'you' ? '🗣 ' : l.who === 'ai' ? '🤖 ' : l.who === 'tool' ? '' : '· '}
            {l.text}
          </p>
        ))}
      </div>
    </div>
  );
}
