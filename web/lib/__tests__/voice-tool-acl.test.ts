import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { can } from '../acl';
import { KNOWN_TOOLS, PROPOSE_ACTION_CAPABILITIES, TOOL_CAPABILITIES, capabilityForTool } from '../voice-tool-acl';
import { buildRealtimeTools, type KnownProject } from '../voice-realtime-tools';

/**
 * 工具層權限守衛的釘子(docs/voice-tool-acl-spec-v1.md)。
 * 跟 acl.test.ts「走訪 app/ 目錄確保沒有路由漏登記」同一種精神:這裡不走
 * 目錄,而是直接讀 dispatcher 的原始碼,拿它實際 `if (tool === '...')` 分派的
 * 工具名清單,跟 voice-tool-acl.ts 的登記表比對——確保兩邊不會分岔。
 */

const ROUTE_FILE = join(__dirname, '../../app/api/voice/tools/[tool]/route.ts');

/** 從 dispatcher 原始碼裡撈出所有 `tool === '...'` 比對到的字串,順序不重要 */
function toolNamesInRoute(): string[] {
  const src = readFileSync(ROUTE_FILE, 'utf8');
  const matches = [...src.matchAll(/tool === '([a-z_]+)'/g)];
  return matches.map((m) => m[1]);
}

describe('覆蓋率——dispatcher 分派的每個工具都要能查到能力', () => {
  it('KNOWN_TOOLS 跟 route.ts 實際分派的工具名一致,不能有一邊多或少', () => {
    const dispatched = [...new Set(toolNamesInRoute())].sort();
    const known = [...KNOWN_TOOLS].sort();
    expect(known).toEqual(dispatched);
  });

  it('每個 KNOWN_TOOLS 都能解析出非 null 的能力', () => {
    for (const tool of KNOWN_TOOLS) {
      const body = tool === 'propose_write' ? { action: 'create_task' } : {};
      expect(capabilityForTool(tool, body), tool).not.toBeNull();
    }
  });
});

describe('預設拒絕——沒登記的工具一律 null,不是預設放行', () => {
  it('沒登記過的工具名回 null', () => {
    expect(capabilityForTool('get_monthly_expenses', {})).toBeNull();
    expect(capabilityForTool('delete_project', {})).toBeNull();
  });
});

describe('propose_write 依 body.action 決定能力', () => {
  it("action: 'create_task' → sites", () => {
    expect(capabilityForTool('propose_write', { action: 'create_task' })).toBe('sites');
  });

  it('沒給 action → null', () => {
    expect(capabilityForTool('propose_write', {})).toBeNull();
  });

  it('給不認識的 action → null(不猜、不套用預設能力)', () => {
    expect(capabilityForTool('propose_write', { action: 'delete_everything' })).toBeNull();
  });

  it('PROPOSE_ACTION_CAPABILITIES 跟 TOOL_CAPABILITIES.create_task 是同一格', () => {
    // propose 跟真正 commit 的那個工具必須同能力,否則會出現「提得了案,
    // 但 commit 時才被擋」這種延後才發現的權限錯配
    expect(PROPOSE_ACTION_CAPABILITIES.create_task).toBe(TOOL_CAPABILITIES.create_task);
  });
});

describe('角色——防止哪天有人動 STAFF_DENIED 卻沒人發現', () => {
  it("假想的 finance 能力:staff false、boss true", () => {
    expect(can('staff', 'finance')).toBe(false);
    expect(can('boss', 'finance')).toBe(true);
  });
});

describe('工具清單依角色過濾(voice-realtime-tools.buildRealtimeTools)', () => {
  const projects: KnownProject[] = [{ id: 'p1', name: '測試案場' }];

  it('現有工具全部是 sites,員工/老闆目前拿到的清單應等長', () => {
    const staffTools = buildRealtimeTools(projects, 'staff');
    const bossTools = buildRealtimeTools(projects, 'boss');
    expect(staffTools.length).toBe(bossTools.length);
  });

  it('end_call 沒有能力對應,兩種角色下都在', () => {
    for (const role of ['staff', 'boss'] as const) {
      expect(buildRealtimeTools(projects, role).map((t) => t.name)).toContain('end_call');
    }
  });
});
