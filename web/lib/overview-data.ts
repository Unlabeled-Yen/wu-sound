import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabase';
import { taipeiTodayStr, taipeiCurrentMonthStr } from '@/lib/tz';

// 總覽 v2(13a)桌機資料層。對應 design_handoff_wu_sound/11-overview.md §3-1——
// 這裡只做「現在就能做」的那一批:送修沒下文、報價躺草稿、代墊卡著薪資結算、
// 今天現場(日誌+打卡)、進行中的案子(最近動態+在場設備)、設備三格。
// 未完成/卡住兩欄與設備第四格需要 tasks / day_site_allocations,故意不在這裡做
// (§3-3、§3-2),UI 端也不渲染對應欄位,不是顯示 0。

export type Severity = 'breach' | 'warning' | 'normal';

export interface QueueItem {
  id: string;
  severity: Severity;
  primary: string;
  moduleTag: string;
  secondary: string;
  value: string;
  actionLabel: string;
  actionHref: string;
  actionSolid: boolean;
}

export interface ProjectRow {
  id: string;
  name: string;
  location: string | null;
  latestActivity: string;
  hasActivity: boolean;
  onSiteCount: number;
}

export interface TodayLog {
  id: string;
  time: string;
  note: string;
}

export interface CheckinRow {
  userId: string;
  name: string;
  time: string | null;
}

export interface EquipmentTiles {
  onSiteQty: number;
  onSiteSiteCount: number;
  storageQty: number;
  repairQty: number;
  repairMaxDays: number | null;
}

export interface OverviewData {
  dateLabel: string;
  queue: QueueItem[];
  queueError: string | null;
  decisionCount: number;
  projects: ProjectRow[];
  projectsError: string | null;
  checkins: CheckinRow[];
  checkinsError: string | null;
  todayLogs: TodayLog[];
  todayLogCount: number;
  worklogsError: string | null;
  equipment: EquipmentTiles | null;
  equipmentError: string | null;
  nowLabel: string;
  month: string;
}

const SEVERITY_RANK: Record<Severity, number> = { breach: 2, warning: 1, normal: 0 };

function daysBetween(fromISO: string, toISO: string): number {
  const from = new Date(fromISO).getTime();
  const to = new Date(toISO).getTime();
  return Math.max(0, Math.floor((to - from) / 86400000));
}

function taipeiDayRangeUtc(dateStr: string): { startUtc: string; endUtc: string } {
  const start = new Date(`${dateStr}T00:00:00+08:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { startUtc: start.toISOString(), endUtc: end.toISOString() };
}

function taipeiHm(iso: string): string {
  return new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}

function taipeiMd(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit' }).format(new Date(iso)).replace('/', '-');
}

function relativeActivityLabel(iso: string, todayStr: string): string {
  const isoDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
  if (isoDay === todayStr) return taipeiHm(iso);
  const yesterday = new Date(`${todayStr}T00:00:00+08:00`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(yesterday);
  if (isoDay === yesterdayStr) return `昨天 ${taipeiHm(iso)}`;
  return taipeiMd(iso);
}

export async function loadOverviewData(): Promise<OverviewData> {
  const sb = getSupabaseAdmin();
  const today = taipeiTodayStr();
  const month = taipeiCurrentMonthStr();
  const nowIso = new Date().toISOString();
  const { startUtc, endUtc } = taipeiDayRangeUtc(today);

  const [
    equipmentRes,
    quotesRes,
    sitesRes,
    worklogsRecentRes,
    worklogsTodayRes,
    clockinsTodayRes,
    staffRes,
    expensesRes,
  ] = await Promise.all([
    sb.from('equipment').select('id, name, brand, status, quantity, current_site_id, updated_at').neq('status', 'retired'),
    sb.from('quotes').select('id, project_name, client_name, status, created_at').in('status', ['draft', 'sent']).order('created_at', { ascending: true }),
    sb.from('sites').select('id, name, customer_name').eq('active', true),
    sb.from('worklogs').select('id, site_id, note, created_at, users(name)').order('created_at', { ascending: false }).limit(300),
    sb.from('worklogs').select('id, note, created_at, users(name)').eq('logged_on', today).order('created_at', { ascending: false }),
    sb.from('clockins').select('id, user_id, ts').eq('type', 'in').gte('ts', startUtc).lt('ts', endUtc).order('ts', { ascending: true }),
    sb.from('users').select('id, name').eq('role', 'staff').eq('active', true).order('name'),
    sb.from('expenses').select('id, status, spent_on, captured_at').in('status', ['draft', 'submitted']),
  ]);

  // ---- 設備(三格)+ 送修沒下文佇列:需要 in_repair 品項的 equipment_movements ----
  const equipmentRows = (equipmentRes.data ?? []) as Array<{
    id: string; name: string; brand: string | null; status: string; quantity: number; current_site_id: string | null; updated_at: string;
  }>;
  const onSiteRows = equipmentRows.filter((r) => r.status === 'on_site');
  const storageRows = equipmentRows.filter((r) => r.status === 'in_storage');
  const repairRows = equipmentRows.filter((r) => r.status === 'in_repair');

  const onSiteQty = onSiteRows.reduce((s, r) => s + (r.quantity ?? 0), 0);
  const onSiteSiteCount = new Set(onSiteRows.map((r) => r.current_site_id).filter(Boolean)).size;
  const storageQty = storageRows.reduce((s, r) => s + (r.quantity ?? 0), 0);
  const repairQty = repairRows.reduce((s, r) => s + (r.quantity ?? 0), 0);

  let repairMovementByEquip = new Map<string, string>();
  let equipmentError = equipmentRes.error?.message ?? null;
  if (repairRows.length > 0) {
    const mv = await sb
      .from('equipment_movements')
      .select('equipment_id, moved_at')
      .eq('to_status', 'in_repair')
      .in('equipment_id', repairRows.map((r) => r.id))
      .order('moved_at', { ascending: false });
    if (mv.error) {
      equipmentError = equipmentError ?? mv.error.message;
    } else {
      for (const row of (mv.data ?? []) as Array<{ equipment_id: string; moved_at: string }>) {
        if (!repairMovementByEquip.has(row.equipment_id)) repairMovementByEquip.set(row.equipment_id, row.moved_at);
      }
    }
  }
  const repairDays = repairRows
    .map((r) => repairMovementByEquip.get(r.id))
    .filter((d): d is string => !!d)
    .map((d) => daysBetween(d, nowIso));
  const repairMaxDays = repairDays.length > 0 ? Math.max(...repairDays) : null;

  // ---- 需要你決定佇列 ----
  const queue: QueueItem[] = [];
  const REPAIR_STUCK_THRESHOLD_DAYS = 3; // 送修不到 3 天先不算「沒下文」,避免一送修就被列進待決定

  for (const r of repairRows) {
    const movedAt = repairMovementByEquip.get(r.id);
    if (!movedAt) continue; // 沒有搬運紀錄就不編天數,不虛構
    const days = daysBetween(movedAt, nowIso);
    if (days < REPAIR_STUCK_THRESHOLD_DAYS) continue;
    queue.push({
      id: `repair-${r.id}`,
      severity: 'warning',
      primary: `${r.brand ? r.brand + ' ' : ''}${r.name} 送修沒有下文`,
      moduleTag: '設備庫存',
      secondary: `${taipeiMd(movedAt)} 送修 · 已 ${days} 天沒有更新`,
      value: `${days} 天`,
      actionLabel: '看設備',
      actionHref: `/boss/equipment/${r.id}`,
      actionSolid: false,
    });
  }

  const quoteRows = (quotesRes.data ?? []) as Array<{ id: string; created_at: string }>;
  if (quoteRows.length > 0) {
    const oldest = quoteRows[0].created_at; // 已依 created_at asc 排序
    const oldestDays = daysBetween(oldest, nowIso);
    queue.push({
      id: 'quotes-draft',
      severity: 'warning',
      primary: `${quoteRows.length} 張報價躺在草稿裡沒送出`,
      moduleTag: '報價系統',
      secondary: `最久那張放了 ${oldestDays} 天`,
      value: `${quoteRows.length} 張`,
      actionLabel: '去報價',
      actionHref: '/boss/quotes',
      actionSolid: false,
    });
  }

  const expenseRows = (expensesRes.data ?? []) as Array<{ id: string; status: string; spent_on: string | null; captured_at: string }>;
  const monthBlockers = expenseRows.filter((r) => {
    const src = r.spent_on ?? r.captured_at;
    return String(src).slice(0, 7) === month;
  });
  if (monthBlockers.length > 0) {
    queue.push({
      id: 'pettycash-blocks-payroll',
      severity: 'warning',
      primary: `${monthBlockers.length} 筆代墊卡著薪資結算`,
      moduleTag: '帳務管理',
      secondary: '需要先審核,才能結算本月薪資',
      value: `${monthBlockers.length} 筆`,
      actionLabel: '去審核',
      actionHref: '/boss/expenses',
      actionSolid: false,
    });
  }

  queue.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
  if (queue.length > 0) queue[0].actionSolid = true;

  const queueError = equipmentRes.error?.message || quotesRes.error?.message || expensesRes.error?.message || null;

  // ---- 進行中的案子:最近動態 + 在場設備 ----
  const sites = (sitesRes.data ?? []) as Array<{ id: string; name: string; customer_name: string | null }>;
  const worklogRecent = (worklogsRecentRes.data ?? []) as unknown as Array<{ id: string; site_id: string | null; note: string; created_at: string; users: { name: string } | null }>;
  const latestBySite = new Map<string, { note: string; created_at: string; userName: string }>();
  for (const w of worklogRecent) {
    if (!w.site_id || latestBySite.has(w.site_id)) continue;
    latestBySite.set(w.site_id, { note: w.note, created_at: w.created_at, userName: w.users?.name ?? '?' });
  }
  const onSiteQtyBySite = new Map<string, number>();
  for (const r of onSiteRows) {
    if (!r.current_site_id) continue;
    onSiteQtyBySite.set(r.current_site_id, (onSiteQtyBySite.get(r.current_site_id) ?? 0) + (r.quantity ?? 0));
  }

  const projects: ProjectRow[] = sites
    .filter((s) => latestBySite.has(s.id) || (onSiteQtyBySite.get(s.id) ?? 0) > 0)
    .map((s) => {
      const latest = latestBySite.get(s.id);
      return {
        id: s.id,
        name: s.name,
        location: s.customer_name,
        latestActivity: latest ? `${latest.userName} ${relativeActivityLabel(latest.created_at, today)} 寫了日誌:${latest.note}` : '尚無工作記錄',
        hasActivity: !!latest,
        onSiteCount: onSiteQtyBySite.get(s.id) ?? 0,
      };
    })
    .sort((a, b) => {
      if (a.hasActivity !== b.hasActivity) return a.hasActivity ? -1 : 1;
      return a.name.localeCompare(b.name, 'zh-Hant');
    });

  const projectsError = sitesRes.error?.message || worklogsRecentRes.error?.message || null;

  // ---- 今天現場:日誌 ----
  const worklogsToday = (worklogsTodayRes.data ?? []) as unknown as Array<{ id: string; note: string; created_at: string; users: { name: string } | null }>;
  const todayLogs: TodayLog[] = worklogsToday.slice(0, 5).map((w) => ({ id: w.id, time: taipeiHm(w.created_at), note: w.note }));
  const worklogsError = worklogsTodayRes.error?.message ?? null;

  // ---- 今天現場:打卡 ----
  const staff = (staffRes.data ?? []) as Array<{ id: string; name: string }>;
  const clockinRows = (clockinsTodayRes.data ?? []) as Array<{ user_id: string; ts: string }>;
  const firstClockinByUser = new Map<string, string>();
  for (const c of clockinRows) {
    if (!firstClockinByUser.has(c.user_id)) firstClockinByUser.set(c.user_id, c.ts);
  }
  const checkins: CheckinRow[] = staff.map((u) => ({
    userId: u.id,
    name: u.name,
    time: firstClockinByUser.has(u.id) ? taipeiHm(firstClockinByUser.get(u.id)!) : null,
  }));
  const checkinsError = staffRes.error?.message || clockinsTodayRes.error?.message || null;

  const dateLabel = `${today}　${new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', weekday: 'short' }).format(new Date())}`;
  const nowLabel = new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());

  return {
    dateLabel,
    queue,
    queueError,
    decisionCount: queue.length,
    projects,
    projectsError,
    checkins,
    checkinsError,
    todayLogs,
    todayLogCount: worklogsToday.length,
    worklogsError,
    equipment: equipmentError
      ? null
      : { onSiteQty, onSiteSiteCount, storageQty, repairQty, repairMaxDays },
    equipmentError,
    nowLabel,
    month,
  };
}
