import type { TaskStatus } from './types';

export interface TaskMoveInput {
  to_status: TaskStatus;
  waiting_reason: string | null;
}

/**
 * Validate a task status change. Returns an error message (Chinese) or null if ok.
 * Server is source of truth; client uses this to enable/disable submit.
 */
export function validateTaskMove(input: TaskMoveInput): string | null {
  if (input.to_status === 'blocked' && !input.waiting_reason?.trim()) {
    return '移入「卡住・等料」必須填「在等什麼」';
  }
  return null;
}
