import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { taipeiTodayStr } from './tz';

// 地點簿(design_handoff_wu_sound/15-placebook.md)資料層。
//
// §0 的分組決定:用方案 A——依 sites.customer_name 分組成「地點」,同客戶名的
// 案子(sites 列)算同一個地點。沒有 customer_name 的 site 自己成一組(用
// site.name 當 groupKey)。這裡只有這一個函式決定分組方式,之後若要換成
// B 案(parent_site_id),只要改 groupKey 這一段,UI 不用動。
//
// 沒有任何一項需要新表:equipment/site_knowledge/worklogs/day_site_allocations
// 都已存在,tasks 表也已經建了(見 022_site_knowledge.sql 後續的專案管理批次),
// 但這裡仍把 tasks 查詢包在 try/catch 裡防禦性處理——萬一之後 tasks 表被動過
// 或查詢失敗,「N 件卡住等你拍板」這句話單獨消失,不影響其餘欄位(§10)。

export interface PlaceProject {
  id: string;
  name: string;
  active: boolean;
  categoryId: string | null;
  categoryName: string | null;
  customerName: string | null;
  onSiteEquipmentQty: number; // 該案場目前在場設備件數,用來擋「還有設備在場不能停用」
  pendingTaskCount: number | null; // null = tasks 表查不到/未接上
}

export interface PlaceRow {
  key: string;
  label: string;
  customerName: string | null;
  projects: PlaceProject[];
  activeCount: number;
  onSiteEquipmentQty: number | null; // null 顯示 "—"(不適用/未量測?這裡固定有資料來源,0 就是 0)
  knowledgeCount: number;
  lastVisit: string | null; // 'YYYY-MM-DD',null = 從沒去過
  todayHere: boolean;
  weekHere: boolean;
  blockedTaskCount: number | null; // null = tasks 未接上,不顯示那句話
  dormant: boolean;
}

export interface WeekSlot {
  date: string;
  isToday: boolean;
  siteId: string;
  siteName: string;
  userNames: string[];
}

export interface SiteCategoryOption {
  id: string;
  name: string;
}

export interface PlacebookData {
  places: PlaceRow[];
  activePlaceCount: number;
  activeProjectCount: number;
  totalKnowledgeCount: number;
  weekSlots: WeekSlot[];
  categories: SiteCategoryOption[];
  error: string | null;
}

function isoWeekRange(todayStr: string): { from: string; to: string } {
  const d = new Date(`${todayStr}T00:00:00Z`);
  const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay(); // 週一=1...週日=7
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - (dow - 1));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = (x: Date) => x.toISOString().slice(0, 10);
  return { from: fmt(monday), to: fmt(sunday) };
}

function groupKey(site: { name: string; customer_name: string | null }): string {
  const c = site.customer_name?.trim();
  return c || site.name;
}

export async function loadPlacebookData(sb: SupabaseClient): Promise<PlacebookData> {
  const today = taipeiTodayStr();
  const { from: weekFrom, to: weekTo } = isoWeekRange(today);
  const ninetyDaysAgo = (() => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 90);
    return d.toISOString().slice(0, 10);
  })();

  const [sitesRes, categoriesRes, equipmentRes, knowledgeRes, worklogsRes, allocRes] = await Promise.all([
    sb.from('sites').select('id, name, active, category_id, customer_name').order('name'),
    sb.from('site_categories').select('id, name, active').eq('active', true).order('name'),
    sb.from('equipment').select('current_site_id').eq('status', 'on_site'),
    sb.from('site_knowledge').select('site_id'),
    sb.from('worklogs').select('site_id, logged_on').order('logged_on', { ascending: false }),
    sb.from('day_site_allocations').select('site_id, worked_on, users!day_site_allocations_user_id_fkey(name)').gte('worked_on', weekFrom).lte('worked_on', weekTo),
  ]);

  const firstError = sitesRes.error || categoriesRes.error || equipmentRes.error || knowledgeRes.error || worklogsRes.error || allocRes.error;
  if (firstError) {
    return { places: [], activePlaceCount: 0, activeProjectCount: 0, totalKnowledgeCount: 0, weekSlots: [], categories: [], error: firstError.message };
  }

  // tasks 表獨立查、獨立防禦——失敗不擋其他欄位。
  let tasksRows: Array<{ site_id: string | null; status: string }> = [];
  let tasksOk = true;
  try {
    const tasksRes = await sb.from('tasks').select('site_id, status').in('status', ['decide', 'todo', 'blocked']);
    if (tasksRes.error) tasksOk = false;
    else tasksRows = (tasksRes.data ?? []) as typeof tasksRows;
  } catch {
    tasksOk = false;
  }

  type SiteRow = { id: string; name: string; active: boolean; category_id: string | null; customer_name: string | null };
  const sites = (sitesRes.data ?? []) as SiteRow[];
  const categories = new Map(((categoriesRes.data ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]));

  const onSiteQtyBySite = new Map<string, number>();
  for (const r of (equipmentRes.data ?? []) as Array<{ current_site_id: string | null }>) {
    if (!r.current_site_id) continue;
    onSiteQtyBySite.set(r.current_site_id, (onSiteQtyBySite.get(r.current_site_id) ?? 0) + 1);
  }

  const knowledgeCountBySite = new Map<string, number>();
  for (const r of (knowledgeRes.data ?? []) as Array<{ site_id: string }>) {
    knowledgeCountBySite.set(r.site_id, (knowledgeCountBySite.get(r.site_id) ?? 0) + 1);
  }

  const lastVisitBySite = new Map<string, string>();
  for (const r of (worklogsRes.data ?? []) as Array<{ site_id: string | null; logged_on: string }>) {
    if (!r.site_id) continue;
    if (!lastVisitBySite.has(r.site_id)) lastVisitBySite.set(r.site_id, r.logged_on); // 已依 logged_on desc 排序,第一筆就是最新
  }

  const todayBySite = new Set<string>();
  const weekBySite = new Set<string>();
  type AllocRow = { site_id: string; worked_on: string; users: { name: string } | null };
  const allocRows = (allocRes.data ?? []) as unknown as AllocRow[];
  for (const r of allocRows) {
    weekBySite.add(r.site_id);
    if (r.worked_on === today) todayBySite.add(r.site_id);
  }

  const blockedBySite = new Map<string, number>();
  const pendingBySite = new Map<string, number>();
  for (const t of tasksRows) {
    if (!t.site_id) continue;
    pendingBySite.set(t.site_id, (pendingBySite.get(t.site_id) ?? 0) + 1);
    if (t.status === 'blocked') blockedBySite.set(t.site_id, (blockedBySite.get(t.site_id) ?? 0) + 1);
  }

  const groups = new Map<string, { label: string; customerName: string | null; sites: SiteRow[] }>();
  for (const s of sites) {
    const key = groupKey(s);
    if (!groups.has(key)) groups.set(key, { label: key, customerName: s.customer_name, sites: [] });
    groups.get(key)!.sites.push(s);
  }

  const places: PlaceRow[] = Array.from(groups.values()).map((g) => {
    const siteIds = g.sites.map((s) => s.id);
    const onSiteEquipmentQty = siteIds.reduce((sum, id) => sum + (onSiteQtyBySite.get(id) ?? 0), 0);
    const knowledgeCount = siteIds.reduce((sum, id) => sum + (knowledgeCountBySite.get(id) ?? 0), 0);
    const lastVisit = siteIds.reduce<string | null>((latest, id) => {
      const v = lastVisitBySite.get(id);
      if (!v) return latest;
      if (!latest || v > latest) return v;
      return latest;
    }, null);
    const todayHere = siteIds.some((id) => todayBySite.has(id));
    const weekHere = siteIds.some((id) => weekBySite.has(id));
    const activeCount = g.sites.filter((s) => s.active).length;
    const blockedTaskCount = tasksOk ? siteIds.reduce((sum, id) => sum + (blockedBySite.get(id) ?? 0), 0) : null;
    const anyActive = g.sites.some((s) => s.active);
    const recentlyActive = !!lastVisit && lastVisit >= ninetyDaysAgo;
    const dormant = !anyActive || (!recentlyActive && onSiteEquipmentQty === 0 && !weekHere);

    return {
      key: g.label,
      label: g.label,
      customerName: g.customerName,
      projects: g.sites.map((s) => ({
        id: s.id,
        name: s.name,
        active: s.active,
        categoryId: s.category_id,
        categoryName: s.category_id ? categories.get(s.category_id) ?? null : null,
        customerName: s.customer_name,
        onSiteEquipmentQty: onSiteQtyBySite.get(s.id) ?? 0,
        pendingTaskCount: tasksOk ? (pendingBySite.get(s.id) ?? 0) : null,
      })),
      activeCount,
      onSiteEquipmentQty,
      knowledgeCount,
      lastVisit,
      todayHere,
      weekHere,
      blockedTaskCount,
      dormant,
    };
  });

  // 排序:今天有人在 > 本週要去 > 其餘,同層依最後去(新到舊),沒去過排最後。
  places.sort((a, b) => {
    if (a.dormant !== b.dormant) return a.dormant ? 1 : -1;
    if (a.todayHere !== b.todayHere) return a.todayHere ? -1 : 1;
    if (a.weekHere !== b.weekHere) return a.weekHere ? -1 : 1;
    if (a.lastVisit !== b.lastVisit) return (b.lastVisit ?? '').localeCompare(a.lastVisit ?? '');
    return a.label.localeCompare(b.label, 'zh-Hant');
  });

  // 本週要進場:今天 + 下一個有排程的兩天(依日期由近到遠,最多 3 格)。
  const bySiteName = new Map(sites.map((s) => [s.id, s.name]));
  const byDate = new Map<string, Map<string, string[]>>(); // date -> siteId -> userNames
  for (const r of allocRows) {
    if (!byDate.has(r.worked_on)) byDate.set(r.worked_on, new Map());
    const bySite = byDate.get(r.worked_on)!;
    const siteMap = bySite.get(r.site_id) ?? [];
    if (r.users?.name) siteMap.push(r.users.name);
    bySite.set(r.site_id, siteMap);
  }
  const sortedDates = Array.from(byDate.keys()).sort();
  const weekSlots: WeekSlot[] = [];
  for (const date of sortedDates.slice(0, 3)) {
    const bySite = byDate.get(date)!;
    for (const [siteId, userNames] of bySite) {
      weekSlots.push({ date, isToday: date === today, siteId, siteName: bySiteName.get(siteId) ?? '?', userNames });
      break; // 一天一格只顯示一個代表案場(排班可能同天多案場,§7 的原型是一列三格對應三天,不是三案場)
    }
  }

  return {
    places,
    activePlaceCount: places.filter((p) => !p.dormant).length,
    activeProjectCount: sites.filter((s) => s.active).length,
    totalKnowledgeCount: Array.from(knowledgeCountBySite.values()).reduce((s, n) => s + n, 0),
    weekSlots,
    categories: (categoriesRes.data ?? []) as SiteCategoryOption[],
    error: null,
  };
}
