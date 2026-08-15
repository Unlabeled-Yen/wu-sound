import { SITE_KNOWLEDGE_PIN_LIMIT } from './types';

/**
 * 進場必讀上限 5 條是刻意的摩擦,逼人取捨——要釘第 6 條必須先取消一條。
 * 見 06-project-board.md 11c。
 */
export function validatePin(currentPinnedCount: number): string | null {
  if (currentPinnedCount >= SITE_KNOWLEDGE_PIN_LIMIT) {
    return `進場必讀最多 ${SITE_KNOWLEDGE_PIN_LIMIT} 條,要釘這條請先取消一條`;
  }
  return null;
}
