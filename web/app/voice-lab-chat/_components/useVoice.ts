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
  speaking: boolean;
  error: string | null;
  /** autoStop=true 時,講完停頓會自動結束錄音,不用手動按停止 */
  start: (autoStop?: boolean) => Promise<void>;
  stop: () => void;
  speak: (text: string) => Promise<void>;
  cancelSpeech: () => void;
  clearError: () => void;
}

/** 錄音長度上限。超過自動停止,避免使用者按了忘記放,傳一個巨大的檔案上去 */
const MAX_RECORD_MS = 60_000;

/**
 * 靜音偵測(自動停止錄音,不用手動按停止)。
 *
 * 這不是 handoff §7 講的那種即時串流 VAD——那需要邊講邊辨識、可插話打斷,
 * 是 Lab 3c(Pipecat)的範圍,這裡刻意不做。這裡做的是簡化版:整段錄完、
 * 偵測到停頓才觸發「停止錄音」這個動作,後面照樣是完整上傳辨識,
 * 差別只是「停止」這個按鈕不用手按了。
 *
 * 閾值找不到任何方式在沒有真人麥克風的環境下實測調準——這裡的數字是
 * 根據 handoff §7 VAD 段落的建議值(静音 800ms,口述紀錄場景放寬到 1.5s)
 * 抓中間值,實際跑起來太敏感或太遲鈍都要調,不能當成定案數字。
 */
const SILENCE_MS = 1200;
const MIN_SPEECH_MS = 300; // handoff §8:短於這個長度的觸發當噪音丟棄,不要偵測到就停
const SPEECH_LEVEL = 0.02; // 音量閾值(0~1 的 RMS),環境噪音大時可能要調高

function watchSilence(stream: MediaStream, onSilence: () => void): () => void {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return () => {};

  const ctx = new Ctor();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  const data = new Uint8Array(analyser.frequencyBinCount);

  let speechStartedAt: number | null = null;
  let silenceStartedAt: number | null = null;
  let raf = 0;
  let stopped = false;

  function tick() {
    if (stopped) return;
    analyser.getByteTimeDomainData(data);
    let sumSq = 0;
    for (let i = 0; i < data.length; i += 1) {
      const v = (data[i] - 128) / 128;
      sumSq += v * v;
    }
    const level = Math.sqrt(sumSq / data.length);
    const now = performance.now();

    if (level > SPEECH_LEVEL) {
      if (speechStartedAt === null) speechStartedAt = now;
      silenceStartedAt = null;
    } else if (speechStartedAt !== null && now - speechStartedAt > MIN_SPEECH_MS) {
      if (silenceStartedAt === null) silenceStartedAt = now;
      else if (now - silenceStartedAt > SILENCE_MS) {
        cleanup();
        onSilence();
        return;
      }
    }
    raf = requestAnimationFrame(tick);
  }

  function cleanup() {
    stopped = true;
    cancelAnimationFrame(raf);
    void ctx.close().catch(() => {});
  }

  raf = requestAnimationFrame(tick);
  return cleanup;
}

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
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceCleanupRef = useRef<(() => void) | null>(null);
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

  const start = useCallback(
    async (autoStop = false) => {
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
        if (silenceCleanupRef.current) {
          silenceCleanupRef.current();
          silenceCleanupRef.current = null;
        }

        const type = rec.mimeType || mime || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        if (blob.size < 1000) {
          setError('錄到的聲音太短,請再說一次');
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

      if (autoStop) {
        silenceCleanupRef.current = watchSilence(stream, () => {
          if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
        });
      }
    },
    [upload],
  );

  const stop = useCallback(() => {
    if (silenceCleanupRef.current) {
      silenceCleanupRef.current();
      silenceCleanupRef.current = null;
    }
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }, []);

  const speak = useCallback((text: string) => {
    return new Promise<void>((resolve) => {
      if (typeof window === 'undefined' || !window.speechSynthesis) {
        resolve();
        return;
      }
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-TW';
      u.rate = 1.05;
      setSpeaking(true);
      // onend 保證觸發,onerror(例如被 cancel 打斷)也要 resolve,不然呼叫端會卡住等不到
      u.onend = () => {
        setSpeaking(false);
        resolve();
      };
      u.onerror = () => {
        setSpeaking(false);
        resolve();
      };
      window.speechSynthesis.speak(u);
    });
  }, []);

  const cancelSpeech = useCallback(() => window.speechSynthesis?.cancel(), []);
  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    return () => {
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      if (timerRef.current) clearTimeout(timerRef.current);
      if (silenceCleanupRef.current) silenceCleanupRef.current();
      window.speechSynthesis?.cancel();
    };
  }, []);

  return { supported, recording, transcribing, speaking, error, start, stop, speak, cancelSpeech, clearError };
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
