'use client';

import { useEffect, useRef, useState } from 'react';
import { speechFor, useVoice } from './useVoice';

/**
 * Lab 2 極簡聊天 UI(spec §5)。
 *
 * 確認鈕是這個頁面唯一能觸發寫入的路徑,而且送出的是結構化的 action:'confirm',
 * 不是把「好」「對啊」丟回去讓 LLM 判斷——這是 spec §4「實作硬化」的前端這一半。
 */

interface Option {
  label: string;
  value: string;
}
interface PendingField {
  label: string;
  value: string;
}
interface Pending {
  action: 'create_task' | 'log_note';
  fields: PendingField[];
}
interface ToolTraceEntry {
  name: string;
  ok: boolean;
  error_code?: string;
}

interface ChatMessage {
  id: number;
  role: 'user' | 'agent' | 'error';
  text: string;
  state?: 'clarifying' | 'confirming' | 'responding';
  options?: Option[];
  pending?: Pending;
  warning?: string;
  toolTrace?: ToolTraceEntry[];
  provider?: string;
}

const STATE_LABEL: Record<string, string> = {
  clarifying: '追問中',
  confirming: '等你確認',
  responding: '已回覆',
};

export function ChatClient() {
  const [sessionId, setSessionId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const nextId = useRef(1);
  const bottomRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<ChatMessage['state']>(undefined);

  // 聽到的話怎麼處理,取決於當下狀態:
  // 等你確認的時候走 voice_command(伺服器端白名單比對),其餘當一般訊息
  const voice = useVoice((transcript) => {
    if (stateRef.current === 'confirming') void send('voice_command', transcript);
    else void send('message', transcript);
  });

  // session_id 在 client 端產生:server render 時產生會造成 hydration 不一致
  useEffect(() => {
    setSessionId(crypto.randomUUID());
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  // 只有「最後一則」處於 confirming 的訊息可以按確認——往上翻舊卡片按不動,
  // 避免使用者按到一個早就作廢的提案
  const lastMessage = messages[messages.length - 1];
  const pendingMessage =
    lastMessage?.role === 'agent' && lastMessage.state === 'confirming' ? lastMessage : undefined;
  const awaitingConfirm = Boolean(pendingMessage) && !busy;
  stateRef.current = lastMessage?.role === 'agent' ? lastMessage.state : undefined;

  function push(msg: Omit<ChatMessage, 'id'>) {
    setMessages((prev) => [...prev, { ...msg, id: nextId.current++ }]);
  }

  async function send(action: 'message' | 'confirm' | 'cancel' | 'voice_command', text?: string) {
    if (busy || !sessionId) return;
    setBusy(true);
    if ((action === 'message' || action === 'voice_command') && text) {
      push({ role: 'user', text: action === 'voice_command' ? `🎤 ${text}` : text });
    }
    if (action === 'confirm') push({ role: 'user', text: '✓ 確認' });
    if (action === 'cancel') push({ role: 'user', text: '✕ 取消' });

    try {
      const res = await fetch('/api/voice-lab/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, action, message: text ?? '' }),
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        push({
          role: 'error',
          text: `${String(data.error ?? `HTTP ${res.status}`)}${data.error_code ? `(${String(data.error_code)})` : ''}`,
        });
        return;
      }
      // 記憶體 session 被清掉時明講,不讓它靜默失憶
      if (data.session_reset) {
        push({ role: 'error', text: '對話狀態已重置(伺服器重啟或閒置過久),剛才的提案沒有寫入,請重講一次。' });
      }
      const state = data.state as ChatMessage['state'];
      const pending = (data.pending as Pending | undefined) ?? undefined;
      push({
        role: 'agent',
        text: String(data.reply ?? ''),
        state,
        options: Array.isArray(data.options) ? (data.options as Option[]) : undefined,
        pending,
        warning: typeof data.warning === 'string' ? data.warning : undefined,
        provider: typeof data.provider === 'string' ? data.provider : undefined,
        toolTrace: Array.isArray(data.tool_trace) ? (data.tool_trace as ToolTraceEntry[]) : undefined,
      });

      if (voiceMode) {
        voice.speak(speechFor(String(data.reply ?? ''), state, pending));
        // 等你確認的時候自動再開麥克風,免手情境才不用一直碰螢幕
        if (state === 'confirming') setTimeout(() => voice.start(), 600);
      }
    } catch (e) {
      push({ role: 'error', text: `連線失敗: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput('');
    void send('message', text);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="nm-raised rounded-[var(--nm-radius)] p-4 min-h-[340px] flex flex-col gap-3">
        {messages.length === 0 && (
          <p className="text-[13px]" style={{ color: 'var(--nm-text-faint)' }}>
            例如:「幫我在磐頂那個案子記一筆,木作進場前先放樣」
          </p>
        )}

        {messages.map((m) => (
          <div key={m.id} className={m.role === 'user' ? 'self-end max-w-[85%]' : 'self-start max-w-[92%]'}>
            <div
              className={`rounded-[var(--nm-radius)] px-3 py-2 text-[14px] leading-relaxed whitespace-pre-wrap ${
                m.role === 'user' ? 'nm-flat' : 'nm-inset'
              }`}
              style={{ color: m.role === 'error' ? '#ff8f8f' : 'var(--nm-text-primary)' }}
            >
              {m.text}
            </div>

            {m.warning && (
              <p className="mt-1 text-[12px]" style={{ color: '#f0c674' }}>
                ⚠ {m.warning}
              </p>
            )}

            {m.pending && (
              <div className="nm-raised-sm mt-2 rounded-[var(--nm-radius)] p-3">
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
                  {m.pending.fields.map((f) => (
                    <div key={f.label} className="contents">
                      <dt style={{ color: 'var(--nm-text-faint)' }}>{f.label}</dt>
                      <dd style={{ color: 'var(--nm-text-primary)' }}>{f.value}</dd>
                    </div>
                  ))}
                </dl>
                {m.id === pendingMessage?.id && (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      className="nm-btn-solid text-[14px]"
                      disabled={!awaitingConfirm}
                      onClick={() => void send('confirm')}
                    >
                      確認寫入
                    </button>
                    <button
                      type="button"
                      className="nm-btn text-[14px]"
                      disabled={!awaitingConfirm}
                      onClick={() => void send('cancel')}
                    >
                      取消
                    </button>
                  </div>
                )}
              </div>
            )}

            {m.options && m.options.length > 0 && m.id === messages[messages.length - 1]?.id && (
              <div className="mt-2 flex flex-wrap gap-2">
                {m.options.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    className="nm-btn text-[13px]"
                    disabled={busy}
                    onClick={() => void send('message', `就是「${o.label}」(id: ${o.value})`)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}

            {m.role === 'agent' && (
              <p className="mt-1 text-[11px]" style={{ color: 'var(--nm-text-faint)' }}>
                {STATE_LABEL[m.state ?? ''] ?? ''}
                {m.provider && ` · ${m.provider}`}
                {m.toolTrace && m.toolTrace.length > 0 && (
                  <>
                    {' · '}
                    {m.toolTrace
                      .map((t) => (t.ok ? t.name : `${t.name}✗${t.error_code ?? ''}`))
                      .join(' → ')}
                  </>
                )}
              </p>
            )}
          </div>
        ))}

        {busy && (
          <p className="text-[13px]" style={{ color: 'var(--nm-text-muted)' }}>
            處理中…
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      {voice.error && (
        <p className="text-[12px]" style={{ color: '#ff8f8f' }}>
          🎤 {voice.error}
        </p>
      )}
      {voice.listening && (
        <p className="text-[13px]" style={{ color: 'var(--nm-accent)' }}>
          🎤 聽你說…{voice.interim && <span style={{ color: 'var(--nm-text-muted)' }}> {voice.interim}</span>}
        </p>
      )}

      <form onSubmit={submit} className="flex gap-2">
        <button
          type="button"
          className="nm-btn text-[16px] px-3"
          aria-label={voice.listening ? '停止錄音' : '開始說話'}
          title={voice.supported ? '按一下開始說話' : '這個瀏覽器不支援語音輸入'}
          disabled={busy || !sessionId || !voice.supported}
          onClick={() => (voice.listening ? voice.stop() : voice.start())}
        >
          {voice.listening ? '⏹' : '🎤'}
        </button>
        <input
          className="nm-input flex-1 text-[14px]"
          placeholder={awaitingConfirm ? '要修改內容就直接打字(原提案會作廢)' : '講一件要記的事…'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy || !sessionId}
        />
        <button type="submit" className="nm-btn-solid text-[14px]" disabled={busy || !input.trim() || !sessionId}>
          送出
        </button>
      </form>

      <label className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--nm-text-faint)' }}>
        <input
          type="checkbox"
          className="nm-focus"
          checked={voiceMode}
          disabled={!voice.supported}
          onChange={(e) => {
            setVoiceMode(e.target.checked);
            if (!e.target.checked) voice.cancelSpeech();
          }}
        />
        免手模式:唸出回覆,等你確認時自動開麥克風,說「確認」或「取消」
        {!voice.supported && '(這個瀏覽器不支援,iPhone 的 Safari 目前沒有語音辨識)'}
      </label>
    </div>
  );
}
