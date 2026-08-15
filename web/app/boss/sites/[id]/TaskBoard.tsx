'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TASK_STATUS_LABEL, TASK_STATUS_ORDER, type Task, type TaskStatus } from '@/lib/types';
import { validateTaskMove } from '@/lib/task-validation';
import TaskCard from './TaskCard';

interface Props {
  initialTasks: (Task & { users: { name: string } | null })[];
  archivedDoneCount: number;
}

const COLUMN_BORDER: Record<TaskStatus, string> = {
  boss_decision: 'var(--nm-warning)',
  todo: 'rgba(255,255,255,0.28)',
  blocked: 'var(--nm-danger)',
  done: 'rgba(255,255,255,0.14)',
};

export default function TaskBoard({ initialTasks, archivedDoneCount }: Props) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initialTasks);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [pendingBlock, setPendingBlock] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function moveTask(taskId: string, toStatus: TaskStatus, waitingReason: string | null) {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: toStatus, waiting_reason: waitingReason }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || '更新失敗');
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: toStatus, waiting_reason: toStatus === 'blocked' ? waitingReason : null } : t))
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新失敗');
    } finally {
      setSubmitting(false);
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
    const err = validateTaskMove({ to_status: 'blocked', waiting_reason: reason });
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
    <div>
      {error && !pendingBlock && (
        <div className="mb-2 rounded-xl nm-inset p-2 text-[13px]" style={{ color: 'var(--nm-danger)' }}>{error}</div>
      )}

      <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {TASK_STATUS_ORDER.map((status) => {
          const colTasks = tasks.filter((t) => t.status === status);
          return (
            <div
              key={status}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(status)}
              className="flex flex-col gap-2 min-h-[120px]"
            >
              <div
                className="flex items-baseline justify-between pb-1.5 text-[13px]"
                style={{ borderBottom: `2px solid ${COLUMN_BORDER[status]}`, color: 'var(--nm-text-secondary)' }}
              >
                <span>{TASK_STATUS_LABEL[status]}</span>
                <span className="tabular text-xs" style={{ color: 'var(--nm-text-muted)' }}>{colTasks.length}</span>
              </div>
              <div className="flex flex-col gap-2">
                {colTasks.map((t) => (
                  <TaskCard key={t.id} task={t} onRequestMove={requestMove} onDragStart={setDraggingId} />
                ))}
                {colTasks.length === 0 && (
                  <div className="text-xs rounded-xl nm-inset p-2 text-center" style={{ color: 'var(--nm-text-faint)' }}>
                    還沒有事情落在這裡
                  </div>
                )}
              </div>
              {status === 'done' && (
                <div className="text-xs mt-1" style={{ color: 'var(--nm-text-faint)' }}>
                  完成 14 天後自動封存 · 已封存 {archivedDoneCount} 件
                </div>
              )}
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
    </div>
  );
}
