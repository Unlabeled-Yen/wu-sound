import type { UserRole } from './types';

/**
 * 權限單一事實來源(docs/desktop-lock-and-staff-access-spec-v1.md §5)。
 *
 * 'open'  — 不分角色都能進(登入頁、根路由、voice-lab 工具、對外 webhook 等)。
 * 'self'  — 該路由本身已用 session.id 限定操作者本人範圍,不需要額外的角色判斷。
 * 其餘皆為老闆端功能區塊,是否放行員工由 STAFF_DENIED 決定。
 */
export type Capability =
  | 'open'
  | 'self'
  | 'overview'
  | 'sites'
  | 'quotes'
  | 'equipment'
  | 'ops'
  | 'acoustic'
  | 'finance'
  | 'tenders'
  | 'user-admin'
  | 'more';

/**
 * 員工不得存取的能力。改這裡就等於改權限——不要在個別 page/route 裡
 * 另外寫死角色判斷,否則這份表格會失去「單一事實來源」的意義。
 */
export const STAFF_DENIED: readonly Capability[] = ['finance', 'tenders', 'user-admin', 'more'];

export function can(role: UserRole, cap: Capability): boolean {
  if (cap === 'open' || cap === 'self') return true;
  if (role === 'boss') return true;
  return !STAFF_DENIED.includes(cap);
}

interface PathEntry {
  /** 精確路徑,或路徑前綴(比對時接受 pathname === prefix 或 pathname.startsWith(prefix + '/')) */
  prefix: string;
  cap: Capability;
}

// 由長到短排列——比對時取「最長命中」而非第一個命中,順序本身不影響正確性,
// 但維持長的在前方便人眼閱讀 diff。
const PAGE_CAPABILITIES: PathEntry[] = [
  { prefix: '/boss/tenders', cap: 'tenders' },
  { prefix: '/boss/users', cap: 'user-admin' },
  { prefix: '/boss/more', cap: 'more' },
  { prefix: '/boss/overview', cap: 'finance' },
  { prefix: '/boss/expenses', cap: 'finance' },
  { prefix: '/boss/ledger', cap: 'finance' },
  { prefix: '/boss/close', cap: 'finance' },
  { prefix: '/boss/quotes', cap: 'quotes' },
  { prefix: '/boss/bundles', cap: 'quotes' },
  { prefix: '/boss/catalog', cap: 'quotes' },
  { prefix: '/boss/equipment', cap: 'equipment' },
  { prefix: '/boss/clockins', cap: 'ops' },
  { prefix: '/boss/projects', cap: 'sites' },
  { prefix: '/boss/sites', cap: 'sites' },
  { prefix: '/boss', cap: 'overview' },
  { prefix: '/tools', cap: 'acoustic' },
  { prefix: '/staff', cap: 'self' },
  { prefix: '/login', cap: 'open' },
  { prefix: '/voice-lab-chat', cap: 'open' },
  { prefix: '/voice-lab-realtime', cap: 'open' },
  { prefix: '/', cap: 'open' },
];

const API_CAPABILITIES: PathEntry[] = [
  { prefix: '/api/auth', cap: 'open' },
  { prefix: '/api/boss/close', cap: 'finance' },
  { prefix: '/api/boss/pending-count', cap: 'finance' },
  { prefix: '/api/boss/clockins', cap: 'ops' },
  { prefix: '/api/bundles', cap: 'quotes' },
  { prefix: '/api/catalog', cap: 'quotes' },
  { prefix: '/api/clockins', cap: 'ops' },
  { prefix: '/api/day-site-allocations', cap: 'ops' },
  { prefix: '/api/equipment', cap: 'equipment' },
  { prefix: '/api/expenses', cap: 'self' },
  { prefix: '/api/ledger', cap: 'finance' },
  { prefix: '/api/line/bind-code', cap: 'self' },
  { prefix: '/api/line/webhook', cap: 'open' },
  { prefix: '/api/payroll', cap: 'finance' },
  { prefix: '/api/quotes', cap: 'quotes' },
  { prefix: '/api/receivables', cap: 'finance' },
  { prefix: '/api/site-knowledge', cap: 'sites' },
  { prefix: '/api/sites', cap: 'sites' },
  { prefix: '/api/tasks', cap: 'sites' },
  { prefix: '/api/voice-lab', cap: 'open' },
  { prefix: '/api/voice', cap: 'open' },
];

function matchLongestPrefix(pathname: string, table: PathEntry[]): Capability | null {
  let best: PathEntry | null = null;
  for (const entry of table) {
    const hit = pathname === entry.prefix || pathname.startsWith(entry.prefix + '/');
    if (!hit) continue;
    if (!best || entry.prefix.length > best.prefix.length) best = entry;
  }
  return best?.cap ?? null;
}

/** 頁面路徑 → 能力。查不到回 null(代表這條路徑不在任何已知清單裡)。 */
export function capabilityForPagePath(pathname: string): Capability | null {
  return matchLongestPrefix(pathname, PAGE_CAPABILITIES);
}

/** API 路徑 → 能力。查不到回 null。 */
export function capabilityForApiPath(pathname: string): Capability | null {
  return matchLongestPrefix(pathname, API_CAPABILITIES);
}

/**
 * 老闆一律 true;員工查表,查不到一律 false(預設拒絕)——
 * 新頁面忘了登記進 PAGE_CAPABILITIES,員工就是進不去,而不是默默放行。
 */
export function canAccessPagePath(role: UserRole, pathname: string): boolean {
  if (role === 'boss') return true;
  const cap = capabilityForPagePath(pathname);
  if (cap === null) return false;
  return can(role, cap);
}
