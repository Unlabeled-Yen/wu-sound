'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { retireEquipment } from './actions';

export default function RetireButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    if (!confirm('確認將此設備改為淘汰?此動作會記錄一筆移動,且無法直接還原。')) return;
    setError(null);
    start(async () => {
      const r = await retireEquipment(id);
      if (!r.ok) { setError(r.error || '淘汰失敗'); return; }
      router.push('/boss/equipment');
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="px-4 py-2 rounded border border-red-400 text-red-700 dark:text-red-300 disabled:opacity-50"
      >
        {pending ? '處理中…' : '刪除(改為淘汰)'}
      </button>
      {error && <div className="text-sm text-red-700">{error}</div>}
    </div>
  );
}
