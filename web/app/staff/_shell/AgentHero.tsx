'use client';

import { useState } from 'react';
import { AgentLogo, type AgentState } from './AgentLogo';

// Lab 3 語音後端還沒就緒(見 voice-lab/lab4-mobile-agent-entry-brief-v1.md §2),
// 這裡先只能是待命態、點擊不做任何事——不假裝接了語音,寧可先讓它看起來
// 什麼都沒發生,也不要做一個按了會誤導使用者的假互動。
export function AgentHero() {
  const [state] = useState<AgentState>('idle');

  return (
    <div className="flex justify-center pb-6">
      <AgentLogo state={state} onToggle={() => {}} />
    </div>
  );
}
