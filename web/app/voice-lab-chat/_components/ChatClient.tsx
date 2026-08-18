'use client';

import { useEffect, useRef, useState } from 'react';
import { useVoice } from './useVoice';
import { useAssistantReturn } from '@/app/_shared/useAssistantShortcut';
import { randomClientId } from '@/lib/client-id';
import { AgentLogo, type AgentState } from '@/app/_shared/AgentLogo';

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

export function ChatClient({ autoVoice = false }: { autoVoice?: boolean }) {
  // ⌘K/Ctrl+K 跳回按快捷鍵之前那個 ERP 頁面(見 useAssistantShortcut.ts)。
  useAssistantReturn();

  const [sessionId, setSessionId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  // 手機 logo 入口帶 ?voice=1 進來,一開始就是免手模式——「語音優先」的互動順位
  // (voice-lab/lab4-mobile-agent-entry-brief-v1.md §1.8),不用使用者自己再勾。
  // 2026-08-18 定案:logo 點一下切換免手模式,按著不放是單句錄音——不是兩顆
  // 按鈕,是同一顆 logo 靠手勢分流(見 AgentLogo.tsx)。
  const [voiceMode, setVoiceMode] = useState(autoVoice);
  const nextId = useRef(1);
  const bottomRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<ChatMessage['state']>(undefined);
  // send() 是每次 render 重新產生的函式,裡面若直接讀 voiceMode 會拿到呼叫當下那次
  // render 的值,不是「回覆送達那一刻」的最新值——中途取消勾選會抓不到。用 ref 保證即時。
  const voiceModeRef = useRef(voiceMode);
  voiceModeRef.current = voiceMode;

  // 聽到的話怎麼處理,取決於當下狀態:
  // 等你確認的時候走 voice_command(伺服器端白名單比對),其餘當一般訊息
  const voice = useVoice((transcript) => {
    if (stateRef.current === 'confirming') void send('voice_command', transcript);
    else void send('message', transcript);
  });

  // session_id 在 client 端產生:server render 時產生會造成 hydration 不一致
  useEffect(() => {
    setSessionId(randomClientId());
  }, []);

  // autoVoice 且瀏覽器支援錄音時,session 就緒後直接開始聽——不用使用者再按一次
  // 麥克風。只在 sessionId 剛產生的那一刻做一次,不然使用者手動停止錄音後
  // 這個 effect 不能又把它搶回去重開。
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (!autoVoice || autoStartedRef.current || !sessionId || !voice.supported) return;
    autoStartedRef.current = true;
    void voice.start(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoVoice, sessionId, voice.supported]);

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

      // 2026-08-18 Yen 明確要求拿掉:回覆只用文字顯示,不自動朗讀。
      //
      // 免手模式什麼時候自動關掉:後端沒有明講「這輪對話結束了」的旗標,
      // 用已經在回的 state 反推——clarifying(追問中)/confirming(等你確認)
      // 代表 AI 還需要使用者再講一句,繼續聽;其餘(responding 等最終答案、
      // 或任何非以上兩種)代表這輪告一段落,自動關掉免手模式,不再搶著聽。
      // 這不是 AI 主動下指令關閉,是借用它已經在講的話反推,效果接近但
      // 機制不同,要記得這個差異。
      if (voiceModeRef.current) {
        if (state === 'clarifying' || state === 'confirming') {
          void voice.start(true);
        } else {
          setVoiceMode(false);
        }
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

  // 點一下:切換免手模式。開起來就直接開始聽(等你講);關掉就停止聽,
  // 不留尾巴錄音。長按走另一條路(見下面 onHoldStart/onHoldEnd),
  // 兩者互斥——長按開始時一定不在免手模式的自動聆聽狀態(見 AgentLogo
  // 的手勢判斷,快點快放才會走到這裡)。
  function handleTap() {
    if (voiceMode) {
      setVoiceMode(false);
      if (voice.recording) voice.stop();
      return;
    }
    setVoiceMode(true);
    void voice.start(true);
  }

  // 長按開始:單句手動錄音,不管免手模式現在開或關,長按期間都當作
  // 一次性錄音——鬆開就送出,不會像免手模式那樣講完自動再聽下一句。
  function handleHoldStart() {
    if (voiceMode) setVoiceMode(false);
    if (!voice.recording) void voice.start(false);
  }

  function handleHoldEnd() {
    if (voice.recording) voice.stop();
  }

  // logo 顯示的狀態,跟粗胚定案的五態對齊——executing 這輪先不細分
  // (沒有專門的「工具呼叫中」旗標),busy 一律當 thinking。
  const logoState: AgentState = voice.recording ? 'listening' : busy ? 'thinking' : 'idle';
  const logoLabel = voiceMode && logoState === 'idle' ? '免手模式聽你說…' : undefined;

  return (
    <div className="flex-1 flex flex-col min-h-0 max-w-[720px] w-full mx-auto lg:px-[22px]">
      <div className="flex-1 overflow-y-auto min-h-0 px-[18px] lg:px-0" style={{ overscrollBehavior: 'contain' }}>
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 pb-16">
            <AgentLogo
              state={logoState}
              label={logoLabel}
              onTap={handleTap}
              onHoldStart={handleHoldStart}
              onHoldEnd={handleHoldEnd}
            />
            {!logoLabel && (
              <p className="text-[13px] text-center max-w-[240px]" style={{ color: 'var(--nm-text-faint)' }}>
                輕點下方輸入,或輕點 logo 開免手、按著 logo 錄一句
              </p>
            )}
          </div>
        ) : (
        <div className="flex flex-col gap-3 pt-4 pb-4">
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
        )}
      </div>

      <div
        className="shrink-0 px-[18px] lg:px-0 pt-2 flex flex-col gap-2"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 14px)' }}
      >
      {voice.error && (
        <p className="text-[12px]" style={{ color: '#ff8f8f' }}>
          🎤 {voice.error}
        </p>
      )}
      {voice.recording && (
        <p className="text-[13px]" style={{ color: 'var(--nm-accent)' }}>
          🔴 {voiceMode ? '免手模式聽你說…講完停頓一下會自動送出' : '錄音中…放開就送出'}
        </p>
      )}
      {voice.transcribing && (
        <p className="text-[13px]" style={{ color: 'var(--nm-text-muted)' }}>
          辨識中…
        </p>
      )}
      <form onSubmit={submit} className="flex items-center gap-2">
        {messages.length > 0 && (
          <AgentLogo
            state={logoState}
            label=""
            size={40}
            onTap={handleTap}
            onHoldStart={handleHoldStart}
            onHoldEnd={handleHoldEnd}
          />
        )}
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
      </div>
    </div>
  );
}
