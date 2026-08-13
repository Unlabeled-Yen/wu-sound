'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Lab 3a 語音層:直接用瀏覽器內建的辨識與朗讀,後端不動。
 * 規格:voice-lab/lab3-voice-spec-v1.md §2
 *
 * 這一層刻意只做「輸入法」與「朗讀」,不含任何判斷:
 * 「使用者有沒有同意」是伺服器端白名單比對的事(§1),前端只負責把聽到的字送過去。
 *
 * 已知限制(不假裝沒有):只有 Chrome 系瀏覽器支援;iOS Safari 沒有 SpeechRecognition,
 * 那種情況要明確告訴使用者「你的瀏覽器不支援語音輸入」,不能靜默給一顆按不動的按鈕。
 */

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string; confidence: number };
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [i: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type RecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const ERROR_TEXT: Record<string, string> = {
  'not-allowed': '麥克風權限被拒絕,請在瀏覽器設定裡允許',
  'service-not-allowed': '麥克風權限被拒絕,請在瀏覽器設定裡允許',
  'no-speech': '沒有聽到聲音,再試一次',
  'audio-capture': '找不到麥克風',
  network: '語音辨識服務連不上',
  aborted: '',
};

export interface VoiceState {
  supported: boolean;
  listening: boolean;
  interim: string;
  error: string | null;
  start: () => void;
  stop: () => void;
  speak: (text: string) => void;
  cancelSpeech: () => void;
}

export function useVoice(onFinal: (transcript: string, confidence: number) => void): VoiceState {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  useEffect(() => {
    setSupported(getRecognitionCtor() !== null && typeof window.speechSynthesis !== 'undefined');
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setError('這個瀏覽器不支援語音輸入(iPhone 的 Safari 目前沒有),請改用打字');
      return;
    }
    if (recRef.current) return;

    // 講話前先把朗讀停掉,不然會辨識到自己的聲音
    window.speechSynthesis?.cancel();

    const rec = new Ctor();
    rec.lang = 'zh-TW';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    rec.onresult = (e) => {
      let finalText = '';
      let finalConfidence = 0;
      let interimText = '';
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const r = e.results[i];
        if (r.isFinal) {
          finalText += r[0].transcript;
          finalConfidence = r[0].confidence;
        } else {
          interimText += r[0].transcript;
        }
      }
      setInterim(interimText);
      if (finalText.trim()) {
        setInterim('');
        onFinalRef.current(finalText.trim(), finalConfidence);
      }
    };
    rec.onerror = (e) => {
      const text = ERROR_TEXT[e.error];
      // aborted 是我們自己叫停的,不是錯誤;其餘一律講出來,不靜默
      if (text !== '') setError(text ?? `語音辨識錯誤:${e.error}`);
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
      setInterim('');
    };

    setError(null);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }, []);

  const stop = useCallback(() => {
    recRef.current?.stop();
  }, []);

  const speak = useCallback((text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-TW';
    u.rate = 1.05;
    window.speechSynthesis.speak(u);
  }, []);

  const cancelSpeech = useCallback(() => {
    window.speechSynthesis?.cancel();
  }, []);

  useEffect(() => {
    return () => {
      recRef.current?.abort();
      window.speechSynthesis?.cancel();
    };
  }, []);

  return { supported, listening, interim, error, start, stop, speak, cancelSpeech };
}

/**
 * 語音要唸出來的內容。
 *
 * confirming 狀態**唸結構化欄位而不是模型那句話**——這是 Lab 3 §1 的第三道硬化:
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
