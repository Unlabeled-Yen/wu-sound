'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TASK_STATUS_LABEL, TASK_STATUS_ORDER, type Task, type TaskStatus, type TaskTag } from '@/lib/types';
import { validateTaskMove } from '@/lib/task-validation';
import TaskCard from './TaskCard';

interface Props {
  initialTasks: (Task & { users: { name: string } | null })[];
  archivedDoneCount: number;
}

// 07-視覺校正指南:原型的 #ec3013 換成 --nm-danger 家族,不照抄。
const COLUMN_BORDER: Record<TaskStatus, string> = {
  decide: 'var(--nm-warning)',
  todo: 'rgba(255,255,255,0.28)',
  blocked: 'var(--nm-danger)',
  done: 'rgba(255,255,255,0.14)',
};

const COLUMN_LABEL_COLOR: Record<TaskStatus, string> = {
  decide: 'var(--nm-warning)',
  todo: '#e4e4e7',
  blocked: 'var(--nm-danger-glass-text)',
  done: '#8a8b90',
};

export default function TaskBoard({ initialTasks, archivedDoneCount }: Props) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initialTasks);
  // router.refresh() 讓 server 重抓資料、傳新的 initialTasks 進來,但 useState
  // 的初始值只吃第一次掛載那份——不補這個 effect,「記一筆」送出後畫面永遠
  // 是舊的一份任務清單,看起來像沒反應。
  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [pendingBlock, setPendingBlock] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function moveTask(taskId: string, toStatus: TaskStatus, blockedOn: string | null) {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: toStatus, blocked_on: blockedOn }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || '更新失敗');
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: toStatus, blocked_on: toStatus === 'blocked' ? blockedOn : null } : t))
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新失敗');
    } finally {
      setSubmitting(false);
    }
  }

  async function editTask(taskId: string, title: string, tags: TaskTag[]) {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, tags }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || '更新失敗');
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, title, tags } : t)));
    router.refresh();
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const taskId = pendingDelete;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || '刪除失敗');
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      setPendingDelete(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '刪除失敗');
    } finally {
      setDeleting(false);
    }
  }

  function requestMove(taskId: string, toStatus: TaskStatus) {
    if (toStatus === 'blocked') {
      setReason('');
      setError(null);
      setPendingBlock(taskId);
      return;
    }
    moveTask(taskId, toStatus, null);
  }

  function confirmBlock() {
    if (!pendingBlock) return;
    const err = validateTaskMove({ to_status: 'blocked', blocked_on: reason });
    if (err) { setError(err); return; }
    moveTask(pendingBlock, 'blocked', reason.trim());
    setPendingBlock(null);
  }

  function handleDrop(toStatus: TaskStatus) {
    if (!draggingId) return;
    requestMove(draggingId, toStatus);
    setDraggingId(null);
  }

  return (
    <div className="h-full min-h-0 flex flex-col">
      {error && !pendingBlock && (
        <div className="mb-2 rounded-xl nm-inset p-2 text-[13px]" style={{ color: 'var(--nm-danger)' }}>{error}</div>
      )}

      <div className="grid flex-1 min-h-0" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, alignItems: 'start' }}>
        {TASK_STATUS_ORDER.map((status) => {
          const colTasks = tasks.filter((t) => t.status === status);
          return (
            <div
              key={status}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(status)}
              className="min-w-0 flex flex-col min-h-0"
            >
              <div
                className="flex items-center justify-between"
                style={{ padding: '0 2px 10px', borderBottom: `2px solid ${COLUMN_BORDER[status]}`, marginBottom: 12 }}
              >
                <span style={{ font: '500 12.5px/1 "Noto Sans TC",sans-serif', color: COLUMN_LABEL_COLOR[status] }}>{TASK_STATUS_LABEL[status]}</span>
                <span className="tabular-nums" style={{ font: '500 12px/1 var(--font-geist-mono),monospace', color: COLUMN_LABEL_COLOR[status] }}>{colTasks.length}</span>
              </div>
              <div className="flex flex-col overflow-y-auto min-h-0" style={{ gap: 10 }}>
                {colTasks.map((t) => (
                  <TaskCard key={t.id} task={t} onRequestMove={requestMove} onDragStart={setDraggingId} onEditTask={editTask} onDeleteTask={setPendingDelete} />
                ))}
                {colTasks.length === 0 && (
                  <div className="text-xs rounded-xl nm-inset p-2 text-center" style={{ color: 'var(--nm-text-faint)' }}>
                    還沒有事情落在這裡
                  </div>
                )}
                {status === 'done' && (
                  <div className="text-center" style={{ padding: '10px 0', font: '400 11.5px/1.5 "Noto Sans TC",sans-serif', color: '#6d6e73' }}>
                    完成 14 天後自動封存<br />已封存 {archivedDoneCount} 件
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {pendingBlock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPendingBlock(null)}>
          <div
            className="w-full max-w-sm rounded-2xl nm-raised-lg p-5 space-y-3"
            style={{ background: 'rgba(24,24,28,0.9)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold text-[13.5px]" style={{ color: 'var(--nm-text-primary)' }}>在等什麼?</h3>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              autoFocus
              placeholder="例:等音箱到貨"
              className="nm-input w-full text-[13px]"
            />
            {error && <div className="text-[13px]" style={{ color: 'var(--nm-danger)' }}>{error}</div>}
            <div className="flex gap-2 justify-end">
              <button type="button" className="nm-btn text-[13px]" onClick={() => setPendingBlock(null)}>取消</button>
              <button type="button" disabled={submitting} className="nm-btn-solid text-[13px]" onClick={confirmBlock}>
                {submitting ? '處理中…' : '確認'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPendingDelete(null)}>
          <div
            className="w-full max-w-sm rounded-2xl nm-raised-lg p-5 space-y-3"
            style={{ background: 'rgba(24,24,28,0.9)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold text-[13.5px]" style={{ color: 'var(--nm-text-primary)' }}>確定要刪除這張卡片?</h3>
            <p className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>刪除後無法復原。</p>
            {error && <div className="text-[13px]" style={{ color: 'var(--nm-danger)' }}>{error}</div>}
            <div className="flex gap-2 justify-end">
              <button type="button" className="nm-btn text-[13px]" onClick={() => setPendingDelete(null)}>取消</button>
              <button
                type="button"
                disabled={deleting}
                className="nm-btn-solid text-[13px]"
                style={{ background: 'var(--nm-danger)', color: '#fff' }}
                onClick={confirmDelete}
              >
                {deleting ? '刪除中…' : '刪除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
