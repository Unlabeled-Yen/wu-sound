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
/**
 * 停頓多久算「講完了」。
 *
 * 實測教訓(Yen 2026-08-14):原本設 1200ms,講「幫我在磐頂教會的專案,
 * 記著要帶銅線、兩組麥克風」這種有自然停頓的句子時,會在句中就被切斷,
 * 只錄到片段 → 辨識模型拿到聽不清的音檔就開始編造內容(見下方 MIN_UTTERANCE_MS)。
 * handoff §7 講口述紀錄場景要放寬到 1.5s,這裡再保守一點抓 2s。
 */
const SILENCE_MS = 2000;
const MIN_SPEECH_MS = 300; // handoff §8:短於這個長度的觸發當噪音丟棄,不要偵測到就停

/**
 * 人聲音量門檻改成自動校準,不用寫死的絕對值。
 *
 * 實測教訓(Yen 2026-08-14):原本寫死 0.02,結果他的麥克風音量根本到不了,
 * 系統判定「完全沒講話」,講什麼都被擋掉。麥克風靈敏度、系統音量、講話距離
 * 每台機器都不同,寫死一個絕對值必定會在某些環境完全失效。
 *
 * 改法:錄音開始的前 400ms 當作環境背景音來量基準,人聲門檻取
 * 「背景音的 2.5 倍」與一個很低的絕對下限之中較大者。
 */
const CALIBRATION_MS = 400;
const NOISE_MULTIPLIER = 2.5;
const ABSOLUTE_FLOOR = 0.004;

/**
 * 一段錄音裡「真的有講話」的累計時間下限,低於這個就不送去辨識。
 *
 * 這道防線是必要的,不是保險起見:實測 gpt-4o-transcribe 拿到過短或幾乎無聲的音檔時
 * **會編造內容**,而且會從我們給的熱詞提示裡撈詞彙來編——
 * 送一段只有「嗯」的音檔,它回「木。」「喇叭」(音檔裡根本沒這些字);
 * 不帶熱詞時甚至回日文「はい。」。
 * 如果不擋,使用者會看到系統把編造的句子當成他講的話,那是系統在說謊。
 */
const MIN_UTTERANCE_MS = 800;

/** 診斷數字的顯示格式(小數三位),讓錯誤訊息看得出實際量到多少 */
const d3 = (n: number) => (n < 0 ? 'n/a' : n.toFixed(3));

interface SilenceWatcher {
  cleanup: () => void;
  /** 累計偵測到人聲的毫秒數,用來判斷這段錄音值不值得送去辨識 */
  speechMs: () => number;
  /** 診斷用:量到的峰值音量、背景噪音基準、實際採用的門檻 */
  diagnostics: () => { peak: number; noiseFloor: number; threshold: number };
}

function watchSilence(stream: MediaStream, onSilence: () => void): SilenceWatcher {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  // 沒有 AudioContext 就不做偵測,speechMs 回無限大讓上層的長度檢查放行——
  // 寧可放行讓後端的音檔大小檢查去擋,也不要因為量不到就把使用者的話全部擋掉
  if (!Ctor) {
    return {
      cleanup: () => {},
      speechMs: () => Number.POSITIVE_INFINITY,
      diagnostics: () => ({ peak: -1, noiseFloor: -1, threshold: -1 }),
    };
  }

  const ctx = new Ctor();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  const data = new Uint8Array(analyser.frequencyBinCount);

  const startedAt = performance.now();
  let speechStartedAt: number | null = null;
  let silenceStartedAt: number | null = null;
  let totalSpeechMs = 0;
  let lastTickAt = startedAt;
  let peak = 0;
  let noiseSum = 0;
  let noiseCount = 0;
  let threshold = ABSOLUTE_FLOOR;
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
    const delta = now - lastTickAt;
    lastTickAt = now;
    if (level > peak) peak = level;

    // 前 400ms 只量背景噪音,不判斷人聲——這段時間使用者通常還沒開口
    if (now - startedAt < CALIBRATION_MS) {
      noiseSum += level;
      noiseCount += 1;
      raf = requestAnimationFrame(tick);
      return;
    }
    if (noiseCount > 0) {
      threshold = Math.max((noiseSum / noiseCount) * NOISE_MULTIPLIER, ABSOLUTE_FLOOR);
      noiseCount = 0; // 只算一次,之後沿用
    }

    if (level > threshold) {
      totalSpeechMs += delta;
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
  return {
    cleanup,
    speechMs: () => totalSpeechMs,
    diagnostics: () => ({
      peak,
      noiseFloor: noiseCount > 0 ? noiseSum / Math.max(noiseCount, 1) : threshold / NOISE_MULTIPLIER,
      threshold,
    }),
  };
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
  const silenceRef = useRef<SilenceWatcher | null>(null);
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

        const speechMs = silenceRef.current?.speechMs() ?? Number.POSITIVE_INFINITY;
        const diag = silenceRef.current?.diagnostics();
        if (silenceRef.current) {
          silenceRef.current.cleanup();
          silenceRef.current = null;
        }

        const type = rec.mimeType || mime || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];

        /**
         * 擋掉太短的錄音,避免模型編造內容(見 MIN_UTTERANCE_MS)。
         *
         * 主要判準是**音檔大小**,不是人聲偵測時間——大小是客觀的,
         * 人聲偵測會受麥克風靈敏度影響(實測踩過:門檻寫死導致某些麥克風
         * 永遠判定「沒講話」,使用者講什麼都被擋)。
         * 人聲時間只在「大小勉強及格但幾乎沒偵測到人聲」時當輔助判斷,
         * 而且門檻放很寬,寧可放行讓後端去擋,也不要誤殺真的講話。
         */
        const tooSmall = blob.size < 4000;
        const noSpeechAtAll = speechMs < 200 && blob.size < 8000;
        if (tooSmall || noSpeechAtAll) {
          const d = diag
            ? `(錄到 ${(blob.size / 1024).toFixed(1)}KB、人聲 ${Math.round(speechMs)}ms、` +
              `音量峰值 ${d3(diag.peak)}、門檻 ${d3(diag.threshold)})`
            : `(錄到 ${(blob.size / 1024).toFixed(1)}KB)`;
          setError(`沒有聽到完整的話,請按麥克風再說一次 ${d}`);
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

      // 不管手動還自動都要監聽:自動模式用它判斷「講完了」,
      // 手動模式也需要它算出的 speechMs 來擋掉幾乎沒講話的錄音
      silenceRef.current = watchSilence(stream, () => {
        if (autoStop && recorderRef.current?.state === 'recording') recorderRef.current.stop();
      });
    },
    [upload],
  );

  const stop = useCallback(() => {
    // 這裡不清掉 silenceRef——onstop 還要用它算 speechMs 才能判斷要不要送去辨識
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
      silenceRef.current?.cleanup();
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
