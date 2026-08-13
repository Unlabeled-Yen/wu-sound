// 老闆端導覽的單一事實來源。
//
// 側欄、桌機標題列、手機底部分頁、手機頁面標題以前各自帶一份路徑清單,
// 改選單結構時很容易只改到其中一份——那種失效不會報錯,只會默默把
// 麵包屑指到錯的區塊。全部集中到這裡,並用單元測試釘住。
//
// hidden 的項目仍然參與比對(所以標題/高亮正確),只是不畫在側欄上——
// 用在「一個區塊收成一列、其餘頁面靠頁內分頁進入」的情況,例如報價系統
// 和聲學計算。

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
}

export const NAV_SECTIONS: NavSection[] = [
  {
    key: 'overview',
    label: '總覽',
    items: [{ href: '/boss', label: 'Dashboard' }],
  },
  {
    key: 'finance',
    label: '財務',
    items: [
      { href: '/boss/expenses', label: '零用金管理' },
      { href: '/boss/close', label: '薪資結算' },
      { href: '/boss/ledger', label: '帳務管理' },
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
    key: 'quotes',
    label: '報價系統',
    items: [
      { href: '/boss/quotes', label: '報價系統' },
      { href: '/boss/bundles', label: '標配套組', hidden: true },
      { href: '/boss/catalog', label: '價目表', hidden: true },
    ],
  },
  {
    key: 'equipment',
    label: '設備庫存',
    items: [{ href: '/boss/equipment', label: '設備庫存' }],
  },
  {
    key: 'sites',
    label: '專案管理',
    items: [{ href: '/boss/sites', label: '專案管理' }],
  },
  {
    key: 'ops',
    label: '現場',
    items: [
      { href: '/boss/worklogs', label: '工作記錄' },
      { href: '/boss/clockins', label: '打卡' },
    ],
  },
  {
    key: 'tenders',
    label: '標案',
    // 順序重要:比對用 startsWith,較長的路徑要排前面,不然
    // /boss/tenders/monitor 會被 /boss/tenders 那條先比中,顯示錯的標題。
    items: [
      { href: '/boss/tenders/monitor', label: '標案監測' },
      { href: '/boss/tenders', label: '資料進度板' },
    ],
  },
];

export const SETTINGS_SECTION: NavSection = {
  key: 'settings',
  label: '設定',
  items: [{ href: '/boss/users', label: '使用者管理' }],
};

/** 側欄實際要畫出來的項目 */
export function visibleItems(section: NavSection): NavItem[] {
  return section.items.filter((i) => !i.hidden);
}

function matchScore(pathname: string, href: string): number {
  if (pathname === href) return 1000;
  if (pathname.startsWith(href + '/')) return href.length;
  return 0;
}

export function findActiveSection(pathname: string): NavSection {
  const all = [...NAV_SECTIONS, SETTINGS_SECTION];
  let best: { section: NavSection; score: number } | null = null;
  for (const section of all) {
    const score = Math.max(...section.items.map((i) => matchScore(pathname, i.href)));
    if (!best || score > best.score) best = { section, score };
  }
  return best && best.score > 0 ? best.section : NAV_SECTIONS[0];
}

/** 桌機標題列的大標:當前頁面自己的名字(含 hidden 項目) */
export function findActiveItemLabel(pathname: string): string {
  const section = findActiveSection(pathname);
  let best: { item: NavItem; score: number } | null = null;
  for (const item of section.items) {
    const score = matchScore(pathname, item.href);
    if (score > 0 && (!best || score > best.score)) best = { item, score };
  }
  return (best?.item ?? section.items[0]).label;
}

/** 手機底部 5 格分頁,回傳該亮起來的那一格 */
export function findActiveMobileTab(pathname: string): string {
  if (pathname === '/boss/more' || pathname.startsWith('/boss/more/')) return 'more';
  if (pathname === '/boss') return 'overview';
  if (pathname.startsWith('/boss/expenses')) return 'review';
  // 報價系統三頁同屬一個系統,底部分頁一起亮
  if (
    pathname.startsWith('/boss/quotes') ||
    pathname.startsWith('/boss/bundles') ||
    pathname.startsWith('/boss/catalog')
  ) {
    return 'quotes';
  }
  if (pathname.startsWith('/boss/worklogs') || pathname.startsWith('/boss/clockins')) return 'ops';
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
  '/boss/worklogs': { title: '現場', subtitle: '工作記錄' },
  '/boss/clockins': { title: '打卡', subtitle: '出勤記錄' },
  '/boss/more': { title: '更多', subtitle: '其他管理與設定' },
  '/boss/ledger': { title: '帳務管理' },
  '/boss/close': { title: '薪資結算' },
  '/boss/equipment': { title: '設備庫存' },
  '/boss/sites': { title: '專案管理' },
  '/boss/tenders/monitor': { title: '標案監測', subtitle: '標案' },
  '/boss/tenders': { title: '資料進度板', subtitle: '標案' },
  '/boss/users': { title: '使用者管理' },
  '/tools/spl-calculator': { title: 'SPL 預算計算器', subtitle: '聲學計算' },
  '/tools/array-designer': { title: '陣列設計器', subtitle: '聲學計算' },
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
