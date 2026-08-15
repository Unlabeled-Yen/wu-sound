'use client';

import { useState } from 'react';
import type { CatalogItem } from '@/lib/types';
import AutoModeTab from './AutoModeTab';
import QuantityTab from './QuantityTab';
import UnityTab from './UnityTab';
import SpacingTab from './SpacingTab';
import SplayTab from './SplayTab';
import { ArrayAdvancedSolvePills, type TabKey } from './ArrayAdvancedSolvePills';

interface Props {
  speakers: CatalogItem[];
  initialSpeakerId?: string;
  initialAudienceDistM?: string;
}

// Auto Mode 升為預設主畫面,原本置頂的五分頁改成底部一排「進階求解」pill——
// 五個分頁仍全部保持掛載,只用 display 切換可見度,切分頁不清空各自狀態(規格 B-06)。
export default function ArrayDesignerForm({ speakers, initialSpeakerId, initialAudienceDistM }: Props) {
  const [active, setActive] = useState<TabKey>('auto');

  return (
    <div className="flex flex-col gap-4">
      <div style={{ display: active === 'auto' ? 'block' : 'none' }}>
        <AutoModeTab speakers={speakers} initialSpeakerId={initialSpeakerId} initialAudienceDistM={initialAudienceDistM} />
      </div>
      <div style={{ display: active === 'quantity' ? 'block' : 'none' }}>
        <QuantityTab speakers={speakers} />
      </div>
      <div style={{ display: active === 'unity' ? 'block' : 'none' }}>
        <UnityTab speakers={speakers} />
      </div>
      <div style={{ display: active === 'spacing' ? 'block' : 'none' }}>
        <SpacingTab speakers={speakers} />
      </div>
      <div style={{ display: active === 'splay' ? 'block' : 'none' }}>
        <SplayTab speakers={speakers} />
      </div>

      <ArrayAdvancedSolvePills active={active} onChange={setActive} />
    </div>
  );
}
