'use client';

import { useState } from 'react';
import type { CatalogItem } from '@/lib/types';
import AutoModeTab from './AutoModeTab';
import QuantityTab from './QuantityTab';
import UnityTab from './UnityTab';
import SpacingTab from './SpacingTab';
import SplayTab from './SplayTab';

interface Props {
  speakers: CatalogItem[];
}

const TABS = [
  { key: 'auto', label: 'Auto Mode' },
  { key: 'quantity', label: 'Quantity' },
  { key: 'unity', label: 'Unity' },
  { key: 'spacing', label: 'Spacing' },
  { key: 'splay', label: 'Splay' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function ArrayDesignerForm({ speakers }: Props) {
  const [active, setActive] = useState<TabKey>('auto');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 nm-inset rounded-xl p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActive(t.key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              active === t.key ? 'nm-btn-solid' : ''
            }`}
            style={active === t.key ? { minHeight: 'auto', padding: '6px 16px' } : { color: 'var(--nm-text-secondary)' }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 五個分頁全部保持掛載,只用 display 切換可見度——切分頁不清空各自狀態(規格 B-06)。 */}
      <div style={{ display: active === 'auto' ? 'block' : 'none' }}>
        <AutoModeTab speakers={speakers} />
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
    </div>
  );
}
