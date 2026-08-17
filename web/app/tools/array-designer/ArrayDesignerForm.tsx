'use client';

import { useState } from 'react';
import type { CatalogItem } from '@/lib/types';
import AutoModeTab from './AutoModeTab';
import QuantityTab from './QuantityTab';
import UnityTab from './UnityTab';
import SpacingTab from './SpacingTab';
import SplayTab from './SplayTab';
import { type TabKey } from './ArraySolvePills';

interface Props {
  speakers: CatalogItem[];
  initialSpeakerId?: string;
  initialAudienceDistM?: string;
}

// 陣列面板外層卡片(16-acoustic-merged.md §4:664 = 16 + 40(header) + 12(gap) +
// 424(diagram) + 16 + 156)。五個分頁仍全部保持掛載,各自用 display 切換可見度,
// 切分頁不清空各自狀態(規格 B-06)——active/onChangeTab 現在下放到每個分頁自己
// 判斷是否顯示,這裡不再需要外層 display:block/none 包一層。
export default function ArrayDesignerForm({ speakers, initialSpeakerId, initialAudienceDistM }: Props) {
  const [active, setActive] = useState<TabKey>('auto');

  return (
    <div
      className="flex-1 min-h-0 flex flex-col"
      style={{ borderRadius: 16, background: 'rgba(19,19,23,.5)', border: '1px solid rgba(255,255,255,.13)', padding: '16px 20px', gap: 12 }}
    >
      <AutoModeTab speakers={speakers} initialSpeakerId={initialSpeakerId} initialAudienceDistM={initialAudienceDistM} active={active} onChangeTab={setActive} />
      <QuantityTab speakers={speakers} active={active} onChangeTab={setActive} />
      <UnityTab speakers={speakers} active={active} onChangeTab={setActive} />
      <SpacingTab speakers={speakers} active={active} onChangeTab={setActive} />
      <SplayTab speakers={speakers} active={active} onChangeTab={setActive} />
    </div>
  );
}
