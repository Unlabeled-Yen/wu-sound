'use client';

import { useEffect, useState } from 'react';

// 專案管理備忘(陽春版)。員工手機端新原則的第二支腳——AI 摘要與自動歸檔
// 這次刻意不做(見交接紀錄),先讓員工能把備忘寫進既有 tasks 看板系統,
// 老闆端 /boss/projects/[id] 立刻看得到。API 見 app/api/tasks/route.ts,
// 該 API 本來就沒有角色限制(POST 只檢查 getSession()),不是這次才開放。
//
// site_id 可留空(「先記,後歸案」)——現場猜不出案子時先記下來,
// 待歸案清單由老闆事後分派,不強迫員工先做判斷。

interface Site {
  id: string;
  name: string;
}

const TASK_TAGS = ['urgent', 'order', 'build', 'complaint', 'quote', 'maintain'] as const;
type TaskTag = typeof TASK_TAGS[number];
const TASK_TAG_LABEL: Record<TaskTag, string> = {
  urgent: '急',
  order: '叫料',
  build: '施工',
  complaint: '客訴',
  quote: '報價',
  maintain: '保養',
};

const TASK_STATUS_LABEL: Record<string, string> = {
  decide: '要老闆決定',
  todo: '待辦',
  blocked: '卡住・等料',
  done: '完成',
};

interface TaskRow {
  id: string;
  site_id: string | null;
  status: string;
  title: string;
  tags: string[];
  created_at: string;
  users?: { name: string } | null;
}

const UNASSIGNED = '__unassigned__';

export default function StaffMemoPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [scope, setScope] = useState(UNASSIGNED); // site id 或 UNASSIGNED
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loadingSites, setLoadingSites] = useState(true);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [formSiteId, setFormSiteId] = useState('');
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState<TaskTag[]>([]);
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

  async function loadTasks(nextScope: string) {
    setLoadingTasks(true);
    setListError(null);
    try {
      const qs = nextScope === UNASSIGNED ? 'unassigned=1' : `site_id=${encodeURIComponent(nextScope)}`;
      const res = await fetch(`/api/tasks?${qs}`, { cache: 'no-store' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || '讀取備忘失敗');
      setTasks(j.tasks || []);
    } catch (e) {
      setListError(e instanceof Error ? e.message : '載入失敗');
    } finally {
      setLoadingTasks(false);
    }
  }

  function onPickScope(id: string) {
    setScope(id);
    void loadTasks(id);
  }

  useEffect(() => {
    void loadTasks(UNASSIGNED);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleTag(tag: TaskTag) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!title.trim()) {
      setFormError('請填寫備忘內容');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site_id: formSiteId || null, title: title.trim(), tags }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || '送出失敗');
      setTitle('');
      setTags([]);
      setFormSiteId('');
      setShowForm(false);
      await loadTasks(scope);
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
          寫進去的備忘老闆端立刻看得到。猜不出是哪個案子也沒關係,先記下來，事後再歸案。AI 自動摘要留給下一輪。
        </p>
      </header>

      <label className="block">
        <span className="mb-1 block text-[13px] leading-[1.6] font-medium" style={{ color: 'var(--nm-text-secondary)' }}>看哪個範圍</span>
        <select
          value={scope}
          onChange={(e) => onPickScope(e.target.value)}
          className="nm-input text-[14px]"
          disabled={loadingSites}
        >
          <option value={UNASSIGNED}>待歸案(還沒指定案子)</option>
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

      {loadingTasks ? (
        <p className="text-[13px]" style={{ color: 'var(--nm-text-muted)' }}>載入中…</p>
      ) : tasks.length === 0 ? (
        <p className="text-[13px]" style={{ color: 'var(--nm-text-muted)' }}>這裡還沒有備忘。</p>
      ) : (
        <ul className="space-y-3">
          {tasks.map((t) => (
            <li key={t.id} className="nm-raised rounded-[20px] p-4">
              <div className="flex items-start justify-between gap-2">
                <span className="nm-pill nm-pill-neutral">{TASK_STATUS_LABEL[t.status] ?? t.status}</span>
                <div className="tabular text-[12px] shrink-0" style={{ color: 'var(--nm-text-muted)' }}>
                  {new Date(t.created_at).toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' })}
                </div>
              </div>
              <div className="mt-1.5 text-[14px]" style={{ color: 'var(--nm-text-secondary)', lineHeight: 1.7 }}>
                {t.title}
              </div>
              {t.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {t.tags.map((tag) => (
                    <span key={tag} className="nm-pill nm-pill-neutral">{TASK_TAG_LABEL[tag as TaskTag] ?? tag}</span>
                  ))}
                </div>
              )}
              {t.users?.name && (
                <div className="mt-2 text-[11px]" style={{ color: 'var(--nm-text-faint)' }}>{t.users.name} 記的</div>
              )}
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
              <span className="mb-1 block text-[13px] leading-[1.6] font-medium" style={{ color: 'var(--nm-text-secondary)' }}>專案(不確定可留空,先記再歸案)</span>
              <select
                value={formSiteId}
                onChange={(e) => setFormSiteId(e.target.value)}
                className="nm-input text-[14px]"
              >
                <option value="">先不分案</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>

            <label className="mb-3 block">
              <span className="mb-1 flex justify-between text-[13px] leading-[1.6] font-medium" style={{ color: 'var(--nm-text-secondary)' }}>
                <span>備忘內容</span>
                <span style={{ color: title.length > 200 ? 'var(--nm-danger)' : 'var(--nm-text-faint)' }}>
                  {title.length}/200
                </span>
              </span>
              <textarea
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, 200))}
                rows={3}
                className="nm-input text-[14px]"
                placeholder="例如：三號廳吊點只能吃 80 公斤，下次來還要注意"
                required
                autoFocus
              />
            </label>

            <div className="mb-3 flex flex-wrap gap-1.5">
              {TASK_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={tags.includes(tag) ? 'nm-btn-solid' : 'nm-btn'}
                  style={{ padding: '4px 12px', minHeight: 'auto', fontSize: '12.5px' }}
                >
                  {TASK_TAG_LABEL[tag]}
                </button>
              ))}
            </div>
            <p className="mb-3 text-[12px]" style={{ color: 'var(--nm-text-faint)' }}>預設落在「待辦」，你就是負責人。</p>

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
