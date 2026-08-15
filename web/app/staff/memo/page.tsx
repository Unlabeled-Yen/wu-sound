'use client';

import { useEffect, useState } from 'react';

// 專案管理備忘(陽春版)。員工手機端新原則的第二支腳——AI 摘要與自動歸檔待辦
// 這次刻意不做(見交接紀錄),先讓員工能把備忘寫進既有 site_notes 系統,
// 老闆端 /boss/sites/[id] 立刻看得到、能釘選/升級成檢查表。API 見
// app/api/site-notes/route.ts,共用同一份資料,不是另開一張表。

interface Site {
  id: string;
  name: string;
}

interface SiteNote {
  id: string;
  site_id: string;
  zone: string;
  content: string;
  is_pinned: boolean;
  is_checklist: boolean;
  created_at: string;
}

export default function StaffMemoPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState('');
  const [notes, setNotes] = useState<SiteNote[]>([]);
  const [loadingSites, setLoadingSites] = useState(true);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [zone, setZone] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoadingSites(true);
      try {
        const res = await fetch('/api/sites?active=1', { cache: 'no-store' });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || '讀取專案失敗');
        setSites(j.sites || []);
      } catch (e) {
        setListError(e instanceof Error ? e.message : '載入失敗');
      } finally {
        setLoadingSites(false);
      }
    })();
  }, []);

  async function loadNotes(id: string) {
    if (!id) {
      setNotes([]);
      return;
    }
    setLoadingNotes(true);
    setListError(null);
    try {
      const res = await fetch(`/api/site-notes?site_id=${encodeURIComponent(id)}`, { cache: 'no-store' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || '讀取備忘失敗');
      setNotes(j.notes || []);
    } catch (e) {
      setListError(e instanceof Error ? e.message : '載入失敗');
    } finally {
      setLoadingNotes(false);
    }
  }

  function onPickSite(id: string) {
    setSiteId(id);
    void loadNotes(id);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!siteId) {
      setFormError('請先選擇專案');
      return;
    }
    if (!content.trim()) {
      setFormError('請填寫備忘內容');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/site-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site_id: siteId, zone: zone.trim(), content: content.trim() }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || '送出失敗');
      setZone('');
      setContent('');
      setShowForm(false);
      await loadNotes(siteId);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : '送出失敗');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold" style={{ color: 'var(--nm-text-primary)' }}>專案管理備忘</h1>
        <p className="text-[13px] mt-0.5 leading-[1.6]" style={{ color: 'var(--nm-text-muted)' }}>
          寫進去的備忘老闆端立刻看得到，能釘選成重點或升級成檢查表。AI 自動摘要與待辦歸檔留給下一輪。
        </p>
      </header>

      <label className="block">
        <span className="mb-1 block text-[13px] leading-[1.6] font-medium" style={{ color: 'var(--nm-text-secondary)' }}>選擇專案</span>
        <select
          value={siteId}
          onChange={(e) => onPickSite(e.target.value)}
          className="nm-input text-[14px]"
          disabled={loadingSites}
        >
          <option value="">{loadingSites ? '載入中…' : '請選擇'}</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </label>

      {listError && (
        <div className="nm-inset rounded-xl p-3 text-[13px]" style={{ color: 'var(--nm-danger)' }}>
          {listError}
        </div>
      )}

      {!siteId ? (
        <p className="text-[13px]" style={{ color: 'var(--nm-text-muted)' }}>選一個專案才看得到備忘清單。</p>
      ) : loadingNotes ? (
        <p className="text-[13px]" style={{ color: 'var(--nm-text-muted)' }}>載入中…</p>
      ) : notes.length === 0 ? (
        <p className="text-[13px]" style={{ color: 'var(--nm-text-muted)' }}>這個專案還沒有備忘。</p>
      ) : (
        <ul className="space-y-3">
          {notes.map((n) => (
            <li key={n.id} className="nm-raised rounded-[20px] p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {n.is_pinned && <span className="nm-pill nm-pill-warning">已釘選</span>}
                  {n.is_checklist && <span className="nm-pill nm-pill-neutral">已升為檢查表</span>}
                  {n.zone && <span className="text-[12px]" style={{ color: 'var(--nm-text-faint)' }}>{n.zone}</span>}
                </div>
                <div className="tabular text-[12px] shrink-0" style={{ color: 'var(--nm-text-muted)' }}>
                  {new Date(n.created_at).toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' })}
                </div>
              </div>
              <div className="mt-1.5 text-[14px]" style={{ color: 'var(--nm-text-secondary)', lineHeight: 1.7 }}>
                {n.content}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!showForm && (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="fixed left-[22px] right-[22px] bottom-24 z-30 nm-btn-solid rounded-2xl"
          style={{ height: 54 }}
        >
          ＋ 新增備忘
        </button>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/60 p-4 pt-10 overflow-y-auto">
          <form onSubmit={onSubmit} className="mx-auto max-w-md nm-raised-lg rounded-2xl p-4">
            <h2 className="mb-3 text-lg font-semibold" style={{ color: 'var(--nm-text-primary)' }}>新增備忘</h2>

            {formError && (
              <div className="mb-3 nm-inset rounded-xl p-3 text-[13px]" style={{ color: 'var(--nm-danger)' }}>
                {formError}
              </div>
            )}

            <label className="mb-3 block">
              <span className="mb-1 block text-[13px] leading-[1.6] font-medium" style={{ color: 'var(--nm-text-secondary)' }}>專案</span>
              <select
                value={siteId}
                onChange={(e) => onPickSite(e.target.value)}
                className="nm-input text-[14px]"
                required
              >
                <option value="">請選擇</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>

            <label className="mb-3 block">
              <span className="mb-1 block text-[13px] leading-[1.6] font-medium" style={{ color: 'var(--nm-text-secondary)' }}>廳別/區域(選填)</span>
              <input
                value={zone}
                onChange={(e) => setZone(e.target.value)}
                className="nm-input text-[14px]"
                placeholder="例如：三號廳"
              />
            </label>

            <label className="mb-3 block">
              <span className="mb-1 flex justify-between text-[13px] leading-[1.6] font-medium" style={{ color: 'var(--nm-text-secondary)' }}>
                <span>備忘內容</span>
                <span style={{ color: content.length > 500 ? 'var(--nm-danger)' : 'var(--nm-text-faint)' }}>
                  {content.length}/500
                </span>
              </span>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value.slice(0, 500))}
                rows={4}
                className="nm-input text-[14px]"
                placeholder="例如：三號廳吊點只能吃 80 公斤，下次來還要注意"
                required
              />
            </label>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                disabled={submitting}
                className="flex-1 nm-btn text-[14px] nm-focus"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-[2] nm-btn-solid text-[14px] nm-focus"
              >
                {submitting ? '送出中…' : '送出'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
