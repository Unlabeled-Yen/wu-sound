import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STAFF_DENIED, can, canAccessPagePath, capabilityForApiPath, capabilityForPagePath } from '../acl';

const APP_DIR = join(__dirname, '../../app');

function walk(dir: string, matchFile: (name: string) => boolean, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, matchFile, out);
    } else if (matchFile(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** app/boss/(quote-system)/quotes/[id]/page.tsx → /boss/quotes/:id */
function toRoutePath(absFile: string): string {
  const rel = relative(APP_DIR, absFile).split(sep);
  rel.pop(); // 去掉檔名(page.tsx / route.ts)
  const segments = rel
    .filter((seg) => !(seg.startsWith('(') && seg.endsWith(')'))) // route group,不出現在網址上
    .map((seg) => (seg.startsWith('[') && seg.endsWith(']') ? ':param' : seg));
  const path = '/' + segments.join('/');
  return path === '/' ? '/' : path.replace(/\/$/, '');
}

const pageFiles = walk(APP_DIR, (f) => f === 'page.tsx');
const apiFiles = walk(APP_DIR, (f) => f === 'route.ts');

describe('acl 覆蓋率——每個 page/route 都要能查到能力,不允許漏登記', () => {
  it('每一支 page.tsx 都能在 PAGE_CAPABILITIES 查到能力', () => {
    const missing = pageFiles
      .map(toRoutePath)
      .filter((p) => capabilityForPagePath(p) === null);
    expect(missing, `以下頁面未登記能力,員工會被預設拒絕存取: ${missing.join(', ')}`).toEqual([]);
  });

  it('每一支 route.ts 都能在 API_CAPABILITIES 查到能力', () => {
    const missing = apiFiles
      .map(toRoutePath)
      .filter((p) => capabilityForApiPath(p) === null);
    expect(missing, `以下 API 未登記能力: ${missing.join(', ')}`).toEqual([]);
  });
});

describe('三塊禁區——員工存取一律 false', () => {
  const DENIED_PATHS = [
    '/boss/expenses',
    '/boss/ledger',
    '/boss/ledger/new',
    '/boss/close',
    '/boss/tenders',
    '/boss/tenders/monitor',
    '/boss/tenders/agencies',
    '/boss/users',
    '/boss/users/new',
    '/boss/more',
  ];

  it.each(DENIED_PATHS)('%s 對員工回傳 false', (path) => {
    expect(canAccessPagePath('staff', path)).toBe(false);
  });

  it('STAFF_DENIED 完整涵蓋 finance / tenders / user-admin / more', () => {
    expect([...STAFF_DENIED].sort()).toEqual(['finance', 'more', 'tenders', 'user-admin']);
  });
});

describe('放行給員工的區塊——員工存取一律 true', () => {
  const ALLOWED_PATHS = [
    '/boss',
    '/boss/sites',
    '/boss/projects/:param',
    '/boss/quotes',
    '/boss/bundles',
    '/boss/catalog',
    '/boss/equipment',
    '/boss/equipment/new',
    '/boss/worklogs',
    '/boss/clockins',
    '/tools/spl-calculator',
    '/tools/array-designer',
    '/staff/capture',
    '/staff/settings',
  ];

  it.each(ALLOWED_PATHS)('%s 對員工回傳 true', (path) => {
    expect(canAccessPagePath('staff', path)).toBe(true);
  });
});

describe('老闆——每一條已登記路徑都是 true', () => {
  it('所有頁面對老闆一律放行', () => {
    for (const path of pageFiles.map(toRoutePath)) {
      expect(canAccessPagePath('boss', path), path).toBe(true);
    }
  });
});

describe('can()', () => {
  it('open / self 兩種能力不分角色皆放行', () => {
    expect(can('staff', 'open')).toBe(true);
    expect(can('staff', 'self')).toBe(true);
  });
});
