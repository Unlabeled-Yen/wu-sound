import type { UserRole } from './types';

// 老闆端導覽的單一事實來源。
//
// 側欄、桌機標題列、手機底部分頁、手機頁面標題以前各自帶一份路徑清單,
// 改選單結構時很容易只改到其中一份——那種失效不會報錯,只會默默把
// 麵包屑指到錯的區塊。全部集中到這裡,並用單元測試釘住。
//
// hidden 的項目仍然參與比對(所以標題/高亮正確),只是不畫在側欄上——
// 用在「一個區塊收成一列、其餘頁面靠頁內分頁進入」的情況,例如報價系統
// 和聲學計算。
//
// 員工桌面版(docs/desktop-lock-and-staff-access-spec-v1.md)複用這份結構,
// 靠 navSectionsForRole() 過濾禁區。這裡的過濾只決定「畫不畫出來」,
// 不是權限邊界——真正擋存取的是 lib/acl.ts + 各 page/route 自己的檢查,
// 兩邊各司其職,不要互相依賴。

export interface NavItem {
  href: string;
  label: string;
  /** true = 不畫在側欄,但仍參與 active/標題比對(靠頁內分頁進入) */
  hidden?: boolean;
}

export interface NavSection {
  key: string;
  label: string;
  items: NavItem[];
  /** true = 側欄在這個區塊前面畫一條分隔線,跟前面的區塊拉開視覺距離。 */
  dividerBefore?: boolean;
}

// ============================================================================
// 側欄順序——2026-08-15 Yen 明確指定,之後任何人要改順序前請先跟 Yen 確認,
// 不要因為「看起來該歸類在一起」就自行調整。目前定案的順序與理由:
//
//   總覽 → 專案管理 → 報價系統 → 聲學計算 → 設備庫存 → 現場
//   ────────────────(視覺分隔線,見 dividerBefore)────────────────
//   財務 → 標案
//
// 財務跟標案排到最下面、用分隔線跟上面隔開——這兩塊目前透過
// app/boss/layout.tsx 的 `if (session.role !== 'boss') redirect('/staff')`
// 整個 /boss/* 都已經是老闆專屬,並非額外針對這兩塊加權限檢查,只是
// Yen 這輪明確要求視覺上把它們跟其餘營運頁面分開。
//
// 「現場」區塊內部順序(工作記錄/打卡)這輪不動,Yen 表示之後再調整。
// ============================================================================
export const NAV_SECTIONS: NavSection[] = [
  {
    key: 'overview',
    label: '總覽',
    items: [{ href: '/boss', label: 'Dashboard' }],
  },
  {
    key: 'sites',
    label: '專案管理',
    items: [
      { href: '/boss/sites', label: '專案管理' },
    ],
  },
  {
    key: 'quotes',
    label: '報價系統',
    items: [
      { href: '/boss/quotes', label: '報價系統' },
      { href: '/boss/bundles', label: '標配套組', hidden: true },
      { href: '/boss/catalog', label: '價目表', hidden: true },
    ],
  },
  {
    key: 'acoustic',
    label: '聲學計算',
    items: [
      { href: '/tools/spl-calculator', label: 'SPL 預算計算器' },
      { href: '/tools/array-designer', label: '陣列設計器', hidden: true },
    ],
  },
  {
    key: 'equipment',
    label: '設備庫存',
    items: [{ href: '/boss/equipment', label: '設備庫存' }],
  },
  {
    key: 'ops',
    label: '現場',
    // 工作記錄已從兩端導覽移除(2026-08-18 Yen 裁決:被專案管理看板的
    // 動態軌取代)。路由 /boss/worklogs、/staff/worklog 照專案慣例保留,
    // 只是不再有入口。
    items: [
      { href: '/boss/clockins', label: '打卡' },
    ],
  },
  {
    key: 'finance',
    label: '財務',
    dividerBefore: true,
    items: [
      // 零用金審核維持獨立頁面(手機底部「審核」分頁靠它),但不畫在側欄——
      // 入口改成帳務首頁的待審 pill 與月結模式的阻擋卡連結。薪資結算原本
      // 是獨立頁,現在併進帳務管理的「月結」模式(?mode=payroll),
      // /boss/close 轉址過去,不再需要側欄項目。見
      // docs/payroll-pettycash-merge-spec.md。
      { href: '/boss/expenses', label: '零用金管理', hidden: true },
      { href: '/boss/ledger', label: '帳務管理' },
    ],
  },
  {
    key: 'tenders',
    label: '標案',
    // 順序重要:比對用 startsWith,較長的路徑要排前面,不然
    // /boss/tenders/monitor 會被 /boss/tenders 那條先比中,顯示錯的標題。
    items: [
      { href: '/boss/tenders/monitor', label: '標案監測' },
      { href: '/boss/tenders/agencies', label: '機關經營名單' },
      { href: '/boss/tenders', label: '資料進度板' },
    ],
  },
];

export const SETTINGS_SECTION: NavSection = {
  key: 'settings',
  label: '設定',
  items: [{ href: '/boss/users', label: '使用者管理' }],
};

export const STAFF_SETTINGS_SECTION: NavSection = {
  key: 'settings',
  label: '設定',
  items: [{ href: '/staff/settings', label: '我的設定' }],
};

// 員工桌面版不得看到的側欄區塊——對照 lib/acl.ts 的 STAFF_DENIED
// ('finance' / 'tenders'/ 'user-admin' / 'more')。使用者管理不在 NAV_SECTIONS
// 裡(它在 SETTINGS_SECTION),所以這裡只需要處理 finance 跟 tenders 兩個 key。
const STAFF_DENIED_SECTION_KEYS = new Set(['finance', 'tenders']);

/**
 * 依角色決定側欄要畫哪些區塊。老闆維持原樣;員工就是拿掉財務/標案兩塊,
 * 不額外加區塊(2026-08-18 Yen 明確要求不要「我的作業」)。這只是畫面過濾,
 * 不是權限邊界——見檔案頂端註解。
 */
export function navSectionsForRole(role: UserRole): NavSection[] {
  if (role === 'boss') return NAV_SECTIONS;
  return NAV_SECTIONS.filter((s) => !STAFF_DENIED_SECTION_KEYS.has(s.key));
}

/** 依角色決定側欄底部的設定區塊。員工看不到使用者管理,只能改自己的 PIN。 */
export function settingsSectionForRole(role: UserRole): NavSection {
  return role === 'boss' ? SETTINGS_SECTION : STAFF_SETTINGS_SECTION;
}

/** 側欄實際要畫出來的項目 */
export function visibleItems(section: NavSection): NavItem[] {
  return section.items.filter((i) => !i.hidden);
}

function matchScore(pathname: string, href: string): number {
  if (pathname === href) return 1000;
  if (pathname.startsWith(href + '/')) return href.length;
  return 0;
}

/**
 * sections 預設是老闆的完整結構,保持舊呼叫端(單一參數)行為不變。
 * 員工桌面版由 BossShell 傳入 navSectionsForRole('staff') + settingsSectionForRole('staff')。
 */
export function findActiveSection(
  pathname: string,
  sections: NavSection[] = [...NAV_SECTIONS, SETTINGS_SECTION],
): NavSection {
  let best: { section: NavSection; score: number } | null = null;
  for (const section of sections) {
    const score = Math.max(...section.items.map((i) => matchScore(pathname, i.href)));
    if (!best || score > best.score) best = { section, score };
  }
  return best && best.score > 0 ? best.section : sections[0];
}

/** 桌機標題列的大標:當前頁面自己的名字(含 hidden 項目) */
export function findActiveItemLabel(
  pathname: string,
  sections: NavSection[] = [...NAV_SECTIONS, SETTINGS_SECTION],
): string {
  const section = findActiveSection(pathname, sections);
  let best: { item: NavItem; score: number } | null = null;
  for (const item of section.items) {
    const score = matchScore(pathname, item.href);
    if (score > 0 && (!best || score > best.score)) best = { item, score };
  }
  return (best?.item ?? section.items[0]).label;
}

// 手機底部 5 格分頁:總覽／零用金審核／專案管理備忘／財務／更多——這是老闆手機
// 端的「只看三件事」原則(見交接紀錄)。報價系統、現場(工作記錄/打卡)、設備庫存、
// 標案、聲學計算、使用者管理都不再各自佔一格,一律收進「更多」,不逐項砍功能。
/** 手機底部 5 格分頁,回傳該亮起來的那一格 */
export function findActiveMobileTab(pathname: string): string {
  if (pathname === '/boss/more' || pathname.startsWith('/boss/more/')) return 'more';
  if (pathname === '/boss') return 'overview';
  if (pathname.startsWith('/boss/expenses')) return 'review';
  if (pathname.startsWith('/boss/sites')) return 'projects';
  if (pathname.startsWith('/boss/ledger') || pathname.startsWith('/boss/close')) return 'finance';
  return 'more';
}

export interface MobileTitle {
  title: string;
  subtitle?: string;
}

const MOBILE_TITLES: Record<string, MobileTitle> = {
  '/boss': { title: '總覽', subtitle: '今天需要你處理的事' },
  '/boss/expenses': { title: '零用金審核', subtitle: '每筆須人工確認才生效' },
  '/boss/quotes': { title: '報價系統', subtitle: '進行中的報價單' },
  '/boss/bundles': { title: '標配套組', subtitle: '報價系統' },
  '/boss/catalog': { title: '價目表', subtitle: '報價系統' },
  '/boss/clockins': { title: '打卡', subtitle: '出勤記錄' },
  '/boss/more': { title: '更多', subtitle: '其他管理與設定' },
  '/boss/ledger': { title: '帳務管理' },
  '/boss/equipment': { title: '設備庫存' },
  '/boss/sites': { title: '專案管理' },
  '/boss/tenders/monitor': { title: '標案監測', subtitle: '標案' },
  '/boss/tenders/agencies': { title: '機關經營名單', subtitle: '標案' },
  '/boss/tenders': { title: '資料進度板', subtitle: '標案' },
  '/boss/users': { title: '使用者管理' },
  '/tools/spl-calculator': { title: 'SPL 預算計算器', subtitle: '聲學計算' },
  '/tools/array-designer': { title: '陣列設計器', subtitle: '聲學計算' },
  // 員工桌面版鎖死寬螢幕(見 view-mode.ts),這幾條理論上不會被畫出來,
  // 補上只是避免萬一走到窄螢幕時標題開天窗。
  '/staff/capture': { title: '零用金' },
  '/staff/memo': { title: '專案備忘' },
  '/staff/clockin': { title: '打卡' },
  '/staff/settings': { title: '我的設定' },
};

export function findMobileTitle(pathname: string): MobileTitle {
  if (MOBILE_TITLES[pathname]) return MOBILE_TITLES[pathname];
  const candidates = Object.keys(MOBILE_TITLES)
    .filter((p) => pathname === p || pathname.startsWith(p + '/'))
    .sort((a, b) => b.length - a.length);
  return candidates[0] ? MOBILE_TITLES[candidates[0]] : { title: '' };
}

/** 頁內分頁列(把同一個系統的數頁併成一頁的視覺) */
export interface PageTab {
  href: string;
  label: string;
  /** true = 這個分頁前面畫一條分隔線(主產出 vs 支援設定) */
  dividerBefore?: boolean;
}

export const QUOTE_SYSTEM_TABS: PageTab[] = [
  { href: '/boss/quotes', label: '報價系統' },
  { href: '/boss/bundles', label: '標配套組', dividerBefore: true },
  { href: '/boss/catalog', label: '價目表' },
];

export const ACOUSTIC_TABS: PageTab[] = [
  { href: '/tools/spl-calculator', label: 'SPL 預算計算器' },
  { href: '/tools/array-designer', label: '陣列設計器' },
];

export function isTabActive(pathname: string, tab: PageTab): boolean {
  return pathname === tab.href || pathname.startsWith(tab.href + '/');
}
