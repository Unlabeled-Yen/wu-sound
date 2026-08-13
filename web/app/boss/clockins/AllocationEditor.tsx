'use client';

import { useState } from 'react';

interface SiteOption {
  id: string;
  name: string;
}

interface RowSpec {
  user_id: string;
  user_name: string;
  worked_on: string; // YYYY-MM-DD
  hours: number | null;
}

interface Props {
  sites: SiteOption[];
  rows: RowSpec[];
  initial: Record<string, string[]>; // key = `${user_id}:${worked_on}` -> site_id[]
}

export default function AllocationEditor({ sites, rows, initial }: Props) {
  const [state, setState] = useState<Record<string, string[]>>(initial);
  const [saving, setSaving] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function keyOf(r: RowSpec) {
    return `${r.user_id}:${r.worked_on}`;
  }

  function toggle(key: string, siteId: string) {
    setSavedKey(null);
    setState((cur) => {
      const list = cur[key] ?? [];
      const next = list.includes(siteId) ? list.filter((x) => x !== siteId) : [...list, siteId];
      return { ...cur, [key]: next };
    });
  }

  async function save(r: RowSpec) {
    const key = keyOf(r);
    setError(null);
    setSaving(key);
    try {
      const res = await fetch('/api/day-site-allocations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worked_on: r.worked_on, site_ids: state[key] ?? [], user_id: r.user_id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || '儲存失敗');
      setSavedKey(key);
    } catch (e) {
      setError(e instanceof Error ? e.message : '儲存失敗');
    } finally {
      setSaving(null);
    }
  }

  if (rows.length === 0) {
    return <p className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>本月尚無打卡紀錄可歸屬案場</p>;
  }

  return (
    <div className="space-y-2">
      {error && (
        <div className="text-[13px]" style={{ color: 'var(--nm-danger)' }}>{error}</div>
      )}
      <div className="rounded-2xl nm-raised overflow-x-auto overflow-y-auto">
        <table className="w-full text-[13px]" style={{ minWidth: 720, borderCollapse: 'collapse' }}>
          <thead style={{ background: 'rgba(20,20,24,0.92)' }}>
            <tr style={{ color: 'var(--nm-text-muted)' }}>
              <th className="text-left px-3 py-2 font-normal whitespace-nowrap">日期</th>
              <th className="text-left px-3 py-2 font-normal whitespace-nowrap">員工</th>
              <th className="text-left px-3 py-2 font-normal whitespace-nowrap">當日工時</th>
              <th className="text-left px-3 py-2 font-normal whitespace-nowrap">案場歸屬</th>
              <th className="text-left px-3 py-2 font-normal whitespace-nowrap">動作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const key = keyOf(r);
              const selected = state[key] ?? [];
              return (
                <tr key={key} style={{ borderTop: '1px solid var(--nm-border-hair)' }}>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>{r.worked_on}</td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--nm-text-body)' }}>{r.user_name}</td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>
                    {r.hours !== null ? `${r.hours}h` : <span style={{ color: 'var(--nm-danger-glass-text)' }}>未配對</span>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      {sites.map((s) => {
                        const active = selected.includes(s.id);
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => toggle(key, s.id)}
                            className="nm-pill nm-focus"
                            style={active ? {
                              color: 'var(--nm-success-glass-text)',
                              background: 'rgba(126,207,157,0.14)',
                              borderColor: 'rgba(126,207,157,0.4)',
                            } : undefined}
                          >
                            {active ? '✓ ' : ''}{s.name}
                          </button>
                        );
                      })}
                      {selected.length === 0 && (
                        <span className="text-xs" style={{ color: 'var(--nm-text-faint)' }}>未分攤(內勤/庫房)</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => save(r)}
                      disabled={saving === key}
                      className="nm-btn text-xs nm-focus"
                      style={{ padding: '3px 10px', minHeight: 'auto' }}
                    >
                      {saving === key ? '儲存中…' : '存'}
                    </button>
                    {savedKey === key && <span className="ml-2 text-xs" style={{ color: 'var(--nm-success-glass-text)' }}>已儲存</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
