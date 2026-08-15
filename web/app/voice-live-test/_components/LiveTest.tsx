'use client';

import { useEffect, useRef, useState } from 'react';
import { useAssistantReturn } from '@/app/_shared/useAssistantShortcut';

/**
 * Realtime 最小驗證客戶端(spec §1 連線流程)。
 *
 * 流程:跟自家後端拿短效金鑰 → WebRTC 直連 OpenAI(SDP 交換走
 * POST /v1/realtime/calls)→ 麥克風 track 上行、遠端音訊自動播放、
 * data channel "oai-events" 收事件顯示逐字稿。
 *
 * 這一頁刻意不做任何工具/寫入——先回答一個問題:「對話流不流暢」。
 * 錯誤全部原文攤在畫面上,第一次接新 API,錯誤訊息就是除錯地圖。
 */

interface LogLine {
  id: number;
  who: 'you' | 'ai' | 'sys';
  text: string;
}

export function LiveTest() {
  useAssistantReturn();
  const [status, setStatus] = useState<'idle' | 'connecting' | 'live' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState('');
  const [lines, setLines] = useState<LogLine[]>([]);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const nextId = useRef(1);
  const aiLineRef = useRef<number | null>(null);

  function push(who: LogLine['who'], text: string): number {
    const id = nextId.current++;
    setLines((prev) => [...prev.slice(-60), { id, who, text }]);
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
      return [...prev.slice(-60), { id, who: 'ai' as const, text: delta }];
    });
  }

  async function connect() {
    setStatus('connecting');
    setError(null);
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
      dc.onmessage = (e) => {
        try {
          const ev = JSON.parse(e.data) as Record<string, unknown>;
          const type = String(ev.type ?? '');
          if (type === 'conversation.item.input_audio_transcription.completed') {
            push('you', String(ev.transcript ?? ''));
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
      push('sys', `已連線(${String(token.model)}),直接開口講話`);
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
    if (resetStatus) {
      setStatus('idle');
      push('sys', '已掛斷');
    }
  }

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

      <div className="nm-raised rounded-[var(--nm-radius)] p-4 min-h-[300px] flex flex-col gap-2">
        {lines.length === 0 && (
          <p className="text-[13px]" style={{ color: 'var(--nm-text-faint)' }}>
            連線後,你講的話與它的回覆會即時顯示在這裡(音訊為主,文字是逐字稿)
          </p>
        )}
        {lines.map((l) => (
          <p
            key={l.id}
            className={`text-[13px] leading-relaxed ${l.who === 'you' ? 'self-end text-right' : ''}`}
            style={{ color: l.who === 'sys' ? 'var(--nm-text-faint)' : 'var(--nm-text-primary)' }}
          >
            {l.who === 'you' ? '🗣 ' : l.who === 'ai' ? '🤖 ' : '· '}
            {l.text}
          </p>
        ))}
      </div>
    </div>
  );
}
