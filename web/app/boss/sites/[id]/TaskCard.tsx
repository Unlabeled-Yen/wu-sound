'use client';

import { useState } from 'react';
import { TASK_STATUS_LABEL, type Task, type TaskStatus } from '@/lib/types';

interface Props {
  task: Task & { users: { name: string } | null };
  onRequestMove: (taskId: string, toStatus: TaskStatus) => void;
  onDragStart: (taskId: string) => void;
}

const TAG_STYLE_URGENT = { color: 'var(--nm-danger-glass-text)', background: 'rgba(224,122,122,0.18)', borderColor: 'rgba(224,122,122,0.34)' };
const TAG_STYLE_NEUTRAL = { color: '#b8b8bb', background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.1)' };

function stuckDays(stuckSince: string | null): number | null {
  if (!stuckSince) return null;
  return Math.floor((Date.now() - new Date(stuckSince).getTime()) / (24 * 60 * 60 * 1000));
}

export default function TaskCard({ task, onRequestMove, onDragStart }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const days = task.status === 'blocked' ? stuckDays(task.stuck_since) : null;
  const checklistDone = task.checklist.filter((c) => c.done).length;

  return (
    <div
      draggable
      onDragStart={() => onDragStart(task.id)}
      className={`rounded-xl p-2.5 text-[13px] space-y-1.5 cursor-grab ${task.status === 'done' ? 'opacity-60' : 'nm-flat'}`}
      style={task.status === 'done' ? { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' } : undefined}
    >
      {task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {task.tags.map((t) => (
            <span key={t} className="nm-pill" style={t === '急' ? TAG_STYLE_URGENT : TAG_STYLE_NEUTRAL}>
              {t}
            </span>
          ))}
        </div>
      )}

      <div style={{ color: 'var(--nm-text-body)' }}>{task.title}</div>

      {task.status === 'blocked' && (
        <div className="rounded-lg p-2 text-xs" style={{ background: 'rgba(8,8,10,0.5)', color: 'var(--nm-text-secondary)' }}>
          在等 {task.waiting_reason || '(未填)'}
        </div>
      )}

      {task.checklist.length > 0 && (
        <div className="text-xs" style={{ color: 'var(--nm-text-muted)' }}>
          子項 {checklistDone}/{task.checklist.length}
        </div>
      )}

      <div className="flex items-center justify-between text-xs pt-1" style={{ color: 'var(--nm-text-muted)' }}>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center rounded-full nm-inset-sm w-5 h-5 text-[10px]">
            {(task.users?.name || '?').slice(0, 1)}
          </span>
          {task.due_date && <span className="tabular">{task.due_date}</span>}
          {days !== null && (
            <span style={days >= 3 ? { color: 'var(--nm-danger-glass-text)' } : undefined}>已卡 {days} 天</span>
          )}
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="nm-focus px-1"
            aria-label="改狀態"
          >
            ⋯
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 z-10 mt-1 rounded-xl nm-raised-lg p-1 w-36"
              style={{ background: 'rgba(24,24,28,0.92)' }}
              onMouseLeave={() => setMenuOpen(false)}
            >
              {(Object.keys(TASK_STATUS_LABEL) as TaskStatus[])
                .filter((s) => s !== task.status)
                .map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="block w-full text-left px-2 py-1.5 rounded-lg text-[12.5px] nm-lift"
                    style={{ color: 'var(--nm-text-secondary)' }}
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
  );
}
