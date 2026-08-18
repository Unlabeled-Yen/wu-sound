'use client';

import { useState } from 'react';
import type { CatalogItem } from '@/lib/types';
import { SplBudgetBand } from './SplBudgetBand';
import ArrayDesignerForm from '../array-designer/ArrayDesignerForm';

interface Props {
  speakers: CatalogItem[];
  amps: CatalogItem[];
  initialSpeakerId?: string;
  initialAudienceDistM?: string;
}

// 16-acoustic-merged.md §0:高度是硬預算,寬度隨容器流動(定案時的原始規格是
// literal 1440,但這次併頁決定跟著現有 /tools/ 版位的容器寬度走,不強制寫死
// 1440——840 的高度分配則照規格寫死,不捲動,是這個元件唯一固定的軸)。
//
// 840 = 16(上) + 132(SPL帶) + 12(gap) + 664(陣列面板) + 16(下)
// 664 由 ArrayDesignerForm 自己的 flex:1 卡片撐出來,這裡只分配 outer padding。
//
// 兩支工具現在同頁,SPL 帶算出的喇叭/建議距離直接餵給陣列面板的初始值——
// 跟 URL handoff(?speaker=&throw=)是同一組語意,只是不用再跳頁。
export function AcousticWorkbench({ speakers, amps, initialSpeakerId, initialAudienceDistM }: Props) {
  const [handoff, setHandoff] = useState<{ speakerId: string; recommendedM: number | null }>({ speakerId: '', recommendedM: null });

  return (
    <div
      data-acoustic-page
      className="flex flex-col"
      style={{ height: 840, maxHeight: '100vh', overflow: 'hidden', padding: 16, gap: 12 }}
    >
      <SplBudgetBand speakers={speakers} amps={amps} initialSpeakerId={initialSpeakerId} onRecommendedChange={setHandoff} />
      <ArrayDesignerForm
        speakers={speakers}
        initialSpeakerId={initialSpeakerId ?? (handoff.speakerId || undefined)}
        initialAudienceDistM={initialAudienceDistM ?? (handoff.recommendedM != null ? handoff.recommendedM.toFixed(1) : undefined)}
      />
    </div>
  );
}
