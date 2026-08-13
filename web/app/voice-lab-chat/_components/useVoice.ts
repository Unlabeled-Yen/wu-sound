'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Lab 3b 語音層:瀏覽器只負責錄音與朗讀,辨識在我們自己的後端做。
 * 規格:voice-lab/lab3-voice-spec-v1.md §2
 *
 * 為什麼不是用瀏覽器內建的 SpeechRecognition(3a 試過,已證實不可行):
 * - 那個 API 是外包給 Google 的雲端服務,不是原廠 Chrome 就直接 network error(實測撞到)
 * - iOS Safari 根本沒有這個 API
 * - 不吃熱詞表,專有名詞必錯
 *
 * MediaRecorder 則是所有現代瀏覽器都有(含 iOS Safari 14.3+),
 * 而且辨識在後端做,才能把專案名當熱詞餵進去。
 *
 * 這一層不含任何判斷:「使用者有沒有同意」是伺服器端白名單比對的事(§1),
 * 這裡只負責把聽到的字送過去。
 */

export interface VoiceState {
  supported: boolean;
  recording: boolean;
  transcribing: boolean;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  speak: (text: string) => void;
  cancelSpeech: () => void;
  clearError: () => void;
}

/** 錄音長度上限。超過自動停止,避免使用者按了忘記放,傳一個巨大的檔案上去 */
const MAX_RECORD_MS = 60_000;

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  // Safari 只吃 mp4/aac,Chrome/Firefox 走 webm;讓瀏覽器挑它支援的那個
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return undefined;
}

export function useVoice(onTranscript: (text: string) => void): VoiceState {
  const [supported, setSupported] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  useEffect(() => {
    setSupported(
      typeof navigator !== 'undefined' &&
        Boolean(navigator.mediaDevices?.getUserMedia) &&
        typeof MediaRecorder !== 'undefined',
    );
  }, []);

  const upload = useCallback(async (blob: Blob, mime: string) => {
    setTranscribing(true);
    try {
      const ext = mime.includes('mp4') ? 'mp4' : mime.includes('ogg') ? 'ogg' : 'webm';
      const form = new FormData();
      form.append('audio', blob, `speech.${ext}`);
      form.append('filename', `speech.${ext}`);

      const res = await fetch('/api/voice-lab/transcribe', { method: 'POST', body: form });
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        setError(String(data.error ?? `辨識失敗(HTTP ${res.status})`));
        return;
      }
      const text = String(data.text ?? '').trim();
      if (!text) {
        setError('沒有辨識到內容,請再說一次');
        return;
      }
      onTranscriptRef.current(text);
    } catch (e) {
      setError(`辨識連線失敗:${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTranscribing(false);
    }
  }, []);

  const start = useCallback(async () => {
    if (recorderRef.current) return;
    setError(null);
    // 開始錄音前先把朗讀停掉,不然會錄到自己的聲音
    window.speechSynthesis?.cancel();

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const name = e instanceof DOMException ? e.name : '';
      setError(
        name === 'NotAllowedError'
          ? '麥克風權限被拒絕,請在瀏覽器設定裡允許'
          : name === 'NotFoundError'
            ? '找不到麥克風'
            : `無法開啟麥克風:${e instanceof Error ? e.message : String(e)}`,
      );
      return;
    }

    const mime = pickMimeType();
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunksRef.current = [];

    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      // 麥克風用完就關,不要讓瀏覽器一直亮著錄音指示燈
      stream.getTracks().forEach((t) => t.stop());
      recorderRef.current = null;
      setRecording(false);
      if (timerRef.current) clearTimeout(timerRef.current);

      const type = rec.mimeType || mime || 'audio/webm';
      const blob = new Blob(chunksRef.current, { type });
      chunksRef.current = [];
      if (blob.size < 1000) {
        setError('錄到的聲音太短,請按住講完再放開');
        return;
      }
      void upload(blob, type);
    };

    recorderRef.current = rec;
    setRecording(true);
    rec.start();
    timerRef.current = setTimeout(() => {
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    }, MAX_RECORD_MS);
  }, [upload]);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }, []);

  const speak = useCallback((text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-TW';
    u.rate = 1.05;
    window.speechSynthesis.speak(u);
  }, []);

  const cancelSpeech = useCallback(() => window.speechSynthesis?.cancel(), []);
  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    return () => {
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      if (timerRef.current) clearTimeout(timerRef.current);
      window.speechSynthesis?.cancel();
    };
  }, []);

  return { supported, recording, transcribing, error, start, stop, speak, cancelSpeech, clearError };
}

/**
 * 語音要唸出來的內容。
 *
 * confirming 狀態**唸結構化欄位而不是模型那句話**(Lab 3 §1 第三道硬化):
 * 使用者在語音情境下看不到卡片,唸錯欄位他就不可能發現。
 * 欄位是 runtime 從 canonical payload 生的,不會說謊。
 */
export function speechFor(
  reply: string,
  state: string | undefined,
  pending?: { fields: { label: string; value: string }[] },
): string {
  if (state === 'confirming' && pending) {
    const fields = pending.fields.map((f) => `${f.label}:${f.value}`).join(',');
    return `還沒寫入,請確認。${fields}。要寫入請說確認,不要請說取消。`;
  }
  return reply;
}
