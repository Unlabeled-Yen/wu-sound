'use client';

import { useState } from 'react';
import { TASK_STATUS_LABEL, TASK_TAG_LABEL, type Task, type TaskStatus, type TaskTag } from '@/lib/types';

interface Props {
  task: Task & { users: { name: string } | null };
  onRequestMove: (taskId: string, toStatus: TaskStatus) => void;
  onDragStart: (taskId: string) => void;
}

function daysStuck(blockedSince: string): number {
  return Math.floor((Date.now() - new Date(blockedSince).getTime()) / (24 * 60 * 60 * 1000));
}

export default function TaskCard({ task, onRequestMove, onDragStart }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const cover = task.photos.length > 0 ? task.photos[0] : null;
  const days = task.status === 'blocked' && task.blocked_since ? daysStuck(task.blocked_since) : null;
  const isDone = task.status === 'done';

  return (
    <div
      draggable
      onDragStart={() => onDragStart(task.id)}
      className="cursor-grab"
      style={{
        borderRadius: 'var(--nm-radius)',
        background: isDone ? 'rgba(24,24,28,.5)' : 'rgba(30,30,36,.62)',
        border: task.status === 'blocked' ? '1px solid rgba(224,122,122,.34)' : `1px solid ${isDone ? 'rgba(255,255,255,.07)' : 'rgba(255,255,255,.12)'}`,
        borderLeft: task.status === 'blocked' ? '2px solid var(--nm-danger)' : undefined,
        borderStyle: task.upload_pending ? 'dashed' : undefined,
        borderColor: task.upload_pending ? 'rgba(217,181,107,.55)' : undefined,
        overflow: 'hidden',
      }}
    >
      {task.upload_pending && (
        <div className="flex items-center gap-1.5 px-3 pt-3">
          <span className="inline-block rounded-full" style={{ width: 6, height: 6, background: 'var(--nm-warning)' }} />
          <span style={{ font: '500 10.5px/1 "Noto Sans TC",sans-serif', color: 'var(--nm-warning)' }}>待上傳　等網路</span>
        </div>
      )}

      {cover && (
        <div style={{ height: 88, backgroundImage: `url(/console.jpg)`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'grayscale(1) brightness(.8)' }} />
      )}

      <div style={{ padding: 12 }}>
        {task.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {task.tags.map((t) => (
              <span
                key={t}
                className="rounded"
                style={{
                  padding: '3px 7px',
                  borderRadius: 5,
                  font: '500 10px/1.3 "Noto Sans TC",sans-serif',
                  background: t === 'urgent' ? 'rgba(224,122,122,.18)' : 'rgba(255,255,255,.1)',
                  color: t === 'urgent' ? 'var(--nm-danger-glass-text)' : '#cfcfd2',
                }}
              >
                {TASK_TAG_LABEL[t as TaskTag]}
              </span>
            ))}
          </div>
        )}

        <div style={{ font: '400 13px/1.5 "Noto Sans TC",sans-serif', color: isDone ? '#8a8b90' : '#f0f0f2', marginBottom: 10 }}>
          {task.title}
        </div>

        {task.status === 'blocked' && (
          <div style={{ padding: '8px 9px', borderRadius: 8, background: 'rgba(8,8,10,.5)', font: '400 11.5px/1.5 "Noto Sans TC",sans-serif', color: '#8a8b90', marginBottom: 10 }}>
            在等　{task.blocked_on || '(未填)'}
          </div>
        )}

        <div className="flex items-center justify-between">
          <span
            className="rounded-full flex items-center justify-center"
            style={{ width: 22, height: 22, background: isDone ? '#2c2c33' : '#3a3a42', font: '500 10px/22px "Noto Sans TC",sans-serif', color: isDone ? '#8a8b90' : '#e4e4e7', textAlign: 'center' }}
          >
            {(task.users?.name || '?').slice(0, 1)}
          </span>
          <div className="relative flex items-center gap-2">
            {task.upload_pending ? (
              <span style={{ font: '400 10.5px/1 var(--font-geist-mono),monospace', color: 'var(--nm-warning)' }}>照片 {task.photos.length} 張未傳</span>
            ) : days !== null ? (
              <span style={{ font: '400 10.5px/1 var(--font-geist-mono),monospace', color: days >= 3 ? 'var(--nm-danger-glass-text)' : '#8a8b90' }}>已卡 {days} 天</span>
            ) : task.due_date ? (
              <span className="tabular-nums" style={{ font: '400 10.5px/1 var(--font-geist-mono),monospace', color: isDone ? '#6d6e73' : '#8a8b90' }}>{task.due_date}</span>
            ) : null}
            <button type="button" onClick={() => setMenuOpen((v) => !v)} className="nm-focus px-1" aria-label="改狀態" style={{ color: '#6d6e73' }}>
              ⋯
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 z-10 mt-1 rounded-xl p-1"
                style={{ top: '100%', width: 140, background: 'rgba(24,24,28,.92)', border: '1px solid rgba(255,255,255,.17)', boxShadow: '0 24px 70px -28px rgba(0,0,0,.85)' }}
                onMouseLeave={() => setMenuOpen(false)}
              >
                {(Object.keys(TASK_STATUS_LABEL) as TaskStatus[])
                  .filter((s) => s !== task.status)
                  .map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="block w-full text-left px-2 py-1.5 rounded-lg nm-lift"
                      style={{ fontSize: 12.5, color: '#9c9293' }}
                      onClick={() => { setMenuOpen(false); onRequestMove(task.id, s); }}
                    >
                      移到「{TASK_STATUS_LABEL[s]}」
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
