import { describe, expect, it } from 'vitest';
import {
  NAV_SECTIONS,
  QUOTE_SYSTEM_TABS,
  SETTINGS_SECTION,
  STAFF_SETTINGS_SECTION,
  findActiveItemLabel,
  findActiveMobileTab,
  findActiveSection,
  findMobileTitle,
  isTabActive,
  navSectionsForRole,
  settingsSectionForRole,
  visibleItems,
} from '../nav';

const ALL_SECTIONS = [...NAV_SECTIONS, SETTINGS_SECTION];

describe('導覽結構完整性', () => {
  it('每條路徑只屬於一個區塊', () => {
    const seen = new Map<string, string>();
    for (const s of ALL_SECTIONS) {
      for (const i of s.items) {
        expect(seen.has(i.href), `${i.href} 重複出現在 ${seen.get(i.href)} 與 ${s.key}`).toBe(false);
        seen.set(i.href, s.key);
      }
    }
  });

  it('每個區塊至少留一個項目畫在側欄', () => {
    for (const s of ALL_SECTIONS) {
      expect(visibleItems(s).length, `${s.key} 整個區塊都被隱藏,側欄會少一列`).toBeGreaterThan(0);
    }
  });

  it('區塊只剩一個可見項目時,側欄顯示的是區塊名', () => {
    // 側欄在 visible=1 時畫 section.label,所以那個名字必須是使用者該看到的
    const single = ALL_SECTIONS.filter((s) => visibleItems(s).length === 1);
    expect(single.map((s) => s.label)).toContain('財務');
    expect(single.map((s) => s.label)).toContain('報價系統');
    expect(single.map((s) => s.label)).toContain('聲學計算');
    expect(single.map((s) => s.label)).toContain('設備庫存');
    expect(single.map((s) => s.label)).toContain('專案管理');
  });
});

describe('findActiveSection / findActiveItemLabel', () => {
  const cases: [string, string, string][] = [
    // 路徑, 區塊名(小標), 頁面名(大標)
    ['/boss', '總覽', 'Dashboard'],
    ['/boss/expenses', '財務', '零用金管理'],
    ['/boss/ledger/abc', '財務', '帳務管理'],
    ['/boss/quotes', '報價系統', '報價系統'],
    ['/boss/quotes/abc/print', '報價系統', '報價系統'],
    ['/boss/bundles', '報價系統', '標配套組'],
    ['/boss/catalog', '報價系統', '價目表'],
    ['/boss/equipment', '設備庫存', '設備庫存'],
    ['/boss/equipment/xyz', '設備庫存', '設備庫存'],
    ['/boss/sites', '專案管理', '專案管理'],
    ['/boss/clockins', '現場', '打卡'],
    ['/boss/tenders', '標案', '資料進度板'],
    ['/boss/tenders/monitor', '標案', '標案監測'],
    ['/boss/users', '設定', '使用者管理'],
    ['/tools/acoustic', '聲學計算', '聲學計算'],
  ];

  for (const [path, section, item] of cases) {
    it(`${path} → ${section} / ${item}`, () => {
      expect(findActiveSection(path).label).toBe(section);
      expect(findActiveItemLabel(path)).toBe(item);
    });
  }

  it('/boss/tenders/monitor 不會被 /boss/tenders 搶先比中', () => {
    expect(findActiveItemLabel('/boss/tenders/monitor')).toBe('標案監測');
  });

  it('認不得的路徑退回總覽,不會炸掉', () => {
    expect(findActiveSection('/boss/nope').label).toBe('總覽');
  });
});

describe('手機底部分頁', () => {
  // 老闆手機只留三件事(零用金審核／專案管理備忘／財務)＋總覽／更多——
  // 報價、現場、標案、設備、聲學計算、使用者管理不再各自佔一格,全收進「更多」。
  const cases: [string, string][] = [
    ['/boss', 'overview'],
    ['/boss/expenses', 'review'],
    ['/boss/sites', 'projects'],
    ['/boss/sites/abc', 'projects'],
    ['/boss/ledger', 'finance'],
    ['/boss/ledger/abc', 'finance'],
    ['/boss/close', 'finance'],
    ['/boss/more', 'more'],
    ['/boss/quotes', 'more'],
    ['/boss/bundles', 'more'],
    ['/boss/catalog', 'more'],
    ['/boss/worklogs', 'more'],
    ['/boss/clockins', 'more'],
    ['/boss/equipment', 'more'],
    ['/boss/tenders', 'more'],
    ['/boss/users', 'more'],
  ];
  for (const [path, tab] of cases) {
    it(`${path} → ${tab}`, () => {
      expect(findActiveMobileTab(path)).toBe(tab);
    });
  }
});

describe('手機頁面標題', () => {
  it('側欄有的頁面,手機都有對應標題', () => {
    for (const s of ALL_SECTIONS) {
      for (const i of s.items) {
        if (i.href === '/boss') continue; // 總覽標題是「總覽」不是 Dashboard
        expect(findMobileTitle(i.href).title, `${i.href} 沒有手機標題`).not.toBe('');
      }
    }
  });

  it('子頁沿用最長前綴的標題', () => {
    expect(findMobileTitle('/boss/ledger/abc').title).toBe('帳務管理');
    expect(findMobileTitle('/boss/sites').title).toBe('專案管理');
  });
});

describe('頁內分頁列', () => {
  it('分頁的路徑都存在於導覽結構中', () => {
    const known = new Set(ALL_SECTIONS.flatMap((s) => s.items.map((i) => i.href)));
    for (const t of QUOTE_SYSTEM_TABS) {
      expect(known.has(t.href), `${t.href} 不在導覽結構裡`).toBe(true);
    }
  });

  it('分頁第一項就是側欄那一列指向的頁面', () => {
    expect(QUOTE_SYSTEM_TABS[0].href).toBe(visibleItems(NAV_SECTIONS.find((s) => s.key === 'quotes')!)[0].href);
  });

  it('isTabActive 認子路徑,但不會誤中別的分頁', () => {
    expect(isTabActive('/boss/quotes/abc', QUOTE_SYSTEM_TABS[0])).toBe(true);
    expect(isTabActive('/boss/catalog', QUOTE_SYSTEM_TABS[0])).toBe(false);
    expect(isTabActive('/boss/bundles/new', QUOTE_SYSTEM_TABS[1])).toBe(true);
  });
});

describe('員工桌面版側欄過濾(docs/desktop-lock-and-staff-access-spec-v1.md)', () => {
  it('老闆拿到完整結構,不受影響', () => {
    expect(navSectionsForRole('boss')).toBe(NAV_SECTIONS);
    expect(settingsSectionForRole('boss')).toBe(SETTINGS_SECTION);
  });

  it('員工看不到財務與標案兩個區塊', () => {
    const sections = navSectionsForRole('staff');
    expect(sections.some((s) => s.key === 'finance')).toBe(false);
    expect(sections.some((s) => s.key === 'tenders')).toBe(false);
  });

  it('員工其餘區塊維持不變,不額外加區塊', () => {
    const sections = navSectionsForRole('staff');
    const keys = sections.map((s) => s.key);
    expect(keys).toEqual(['overview', 'sites', 'quotes', 'acoustic', 'equipment', 'ops']);
  });

  it('員工設定區塊指向 /staff/settings,不是使用者管理', () => {
    const settings = settingsSectionForRole('staff');
    expect(settings).toBe(STAFF_SETTINGS_SECTION);
    expect(settings.items[0].href).toBe('/staff/settings');
  });

  it('員工桌面標題列在 /staff/settings 可以正確解出頁面名', () => {
    const sections = [...navSectionsForRole('staff'), settingsSectionForRole('staff')];
    expect(findActiveItemLabel('/staff/settings', sections)).toBe('我的設定');
  });
});
