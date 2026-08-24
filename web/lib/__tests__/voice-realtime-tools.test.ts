import { describe, expect, it } from 'vitest';
import {
  MAX_INLINE_PROJECTS,
  buildRealtimeInstructions,
  buildRealtimeTools,
  canInlineProjects,
  type KnownProject,
} from '@/lib/voice-realtime-tools';

/**
 * 專案清單「內嵌 vs 查詢」兩種模式的釘子。
 *
 * 2026-08-24 把專案清單改成直接寫進提示詞(省一次往返、消滅模糊比對失敗、
 * 工具從 6 個減到 4 個)。第一版有個洞:刪掉了 search_projects 工具,但
 * 超過上限時的退回路徑既沒有內嵌清單、又沒有查詢工具,AI 會完全找不到專案。
 * 這裡把兩種模式都釘住,確保退回路徑是完整可用的,不是一條沒人走過的死路。
 */

const few: KnownProject[] = [
  { id: 'aaa-111', name: '台中復興堂' },
  { id: 'bbb-222', name: '磐頂長老教會' },
];
const many: KnownProject[] = Array.from({ length: MAX_INLINE_PROJECTS + 5 }, (_, i) => ({
  id: `id-${i}`,
  name: `案場${i}`,
}));
const NOW = Date.parse('2026-08-24T02:00:00Z');

describe('內嵌模式(案量小)', () => {
  it('案名與 id 直接寫進提示詞', () => {
    const ins = buildRealtimeInstructions(NOW, few);
    expect(ins).toContain('台中復興堂');
    expect(ins).toContain('aaa-111');
    expect(ins).toContain('磐頂長老教會');
  });

  it('不給 search_projects——清單已經在提示詞裡,再查是多一次往返', () => {
    const names = buildRealtimeTools(few).map((t) => t.name);
    expect(names).not.toContain('search_projects');
    expect(names).toContain('propose_create_task');
  });

  it('用的是「自己對清單」的規則,不是「去查」的規則', () => {
    const ins = buildRealtimeInstructions(NOW, few);
    expect(ins).toContain('清單上最接近');
    expect(ins).not.toContain('必須先呼叫 search_projects');
  });
});

describe('退回模式(案量超過上限,或清單讀取失敗)', () => {
  it('超過上限就不內嵌,避免提示詞被案名塞爆', () => {
    expect(canInlineProjects(many)).toBe(false);
    const ins = buildRealtimeInstructions(NOW, many);
    expect(ins).not.toContain('案場3 → project_id');
  });

  it('退回時一定要補上 search_projects,否則 AI 完全找不到專案', () => {
    // 這是第一版真的漏掉的洞,不是假設性的邊角案例
    expect(buildRealtimeTools(many).map((t) => t.name)).toContain('search_projects');
    expect(buildRealtimeTools([]).map((t) => t.name)).toContain('search_projects');
  });

  it('規則要換成「去查」,不能殘留對不到東西的「上面那份清單」指涉', () => {
    for (const projects of [many, [] as KnownProject[]]) {
      const ins = buildRealtimeInstructions(NOW, projects);
      expect(ins).toContain('必須先呼叫 search_projects');
      expect(ins).not.toContain('上面那份專案清單');
    }
  });
});

describe('不分模式都要成立的鐵律', () => {
  it('模型永遠拿不到直接寫入的工具,只有 propose_*', () => {
    for (const projects of [few, many, [] as KnownProject[]]) {
      const names = buildRealtimeTools(projects).map((t) => t.name);
      expect(names).not.toContain('create_task');
      expect(names).not.toContain('log_note');
      expect(names).toContain('propose_create_task');
    }
  });

  it('工作記錄那條路已經整套移除,不可以復活', () => {
    for (const projects of [few, many]) {
      expect(buildRealtimeTools(projects).map((t) => t.name)).not.toContain('propose_log_note');
    }
  });
});
