import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { EquipmentCategory, VoiceTaskStatus, SiteNote } from '@/lib/types';
import { EQUIPMENT_CATEGORY_LABEL, EQUIPMENT_STATUS_LABEL } from '@/lib/types';
import SiteKnowledge from './SiteKnowledge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface SiteRow {
  id: string;
  name: string;
  active: boolean;
  category_id: string | null;
  customer_name: string | null;
  created_at: string;
}

interface CategoryRow {
  id: string;
  name: string;
}

interface EquipmentRow {
  id: string;
  name: string;
  brand: string | null;
  category: EquipmentCategory;
  quantity: number;
  unit: string;
  status: string;
}

interface TaskRow {
  id: string;
  title: string;
  status: VoiceTaskStatus;
  due_date: string | null;
  created_at: string;
}

interface ReceivableRow {
  id: string;
  direction: 'receivable' | 'payable';
  party: string;
  total_amount_twd: number;
  status: 'open' | 'closed' | 'voided';
  agreed_due_date: string | null;
}

interface LedgerSummary {
  income: number;
  expense: number;
  count: number;
}

interface AllocationRow {
  worked_on: string;
  hours: number | null;
  user_name: string;
}

interface TimelineEvent {
  ts: string;
  kind: 'ledger' | 'equipment' | 'task' | 'allocation';
  label: string;
  detail: string;
}

function formatTwd(n: number): string {
  return n.toLocaleString('zh-TW');
}

function daysAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (diff === 0) return '今天';
  if (diff === 1) return '昨天';
  if (diff < 30) return `${diff} 天前`;
  return iso.slice(0, 10);
}

function shortDate(iso: string): string {
  return iso.slice(5, 10).replace('-', '/');
}

export default async function SiteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'boss') redirect('/staff');

  const { id } = await params;
  const sb = getSupabaseAdmin();

  const { data: site, error } = await sb
    .from('sites')
    .select('id, name, active, category_id, customer_name, created_at')
    .eq('id', id)
    .maybeSingle();

  if (error || !site) notFound();
  const s = site as SiteRow;

  let categoryName: string | null = null;
  if (s.category_id) {
    const { data: cat } = await sb
      .from('site_categories')
      .select('id, name')
      .eq('id', s.category_id)
      .maybeSingle();
    if (cat) categoryName = (cat as CategoryRow).name;
  }

  const [
    { data: eqData },
    { data: taskData },
    { data: recData },
    { data: ledgerData },
    { data: allocData },
    { data: notesData },
  ] = await Promise.all([
    sb.from('equipment')
      .select('id, name, brand, category, quantity, unit, status')
      .eq('current_site_id', id)
      .eq('status', 'on_site')
      .order('category')
      .order('name'),
    sb.from('tasks')
      .select('id, title, status, due_date, created_at')
      .eq('site_id', id)
      .order('created_at', { ascending: false })
      .limit(20),
    sb.from('receivables')
      .select('id, direction, party, total_amount_twd, status, agreed_due_date')
      .eq('site_id', id)
      .neq('status', 'voided')
      .order('created_at', { ascending: false }),
    sb.from('ledger_entries')
      .select('id, occurred_on, direction, kind, amount_twd, party, memo, state, created_at')
      .eq('site_id', id)
      .neq('state', 'voided')
      .order('occurred_on', { ascending: false })
      .limit(50),
    sb.from('day_site_allocations')
      .select('worked_on, hours, user_id')
      .eq('site_id', id)
      .order('worked_on', { ascending: false })
      .limit(30),
    sb.from('site_notes')
      .select('id, site_id, zone, content, is_pinned, is_checklist, created_by, created_at, updated_at')
      .eq('site_id', id)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false }),
  ]);

  const siteNotes = (notesData ?? []) as SiteNote[];
  const noteZones = [...new Set(siteNotes.map(n => n.zone).filter(Boolean))];

  const equipment = (eqData ?? []) as EquipmentRow[];
  const tasks = (taskData ?? []) as TaskRow[];
  const receivables = (recData ?? []) as ReceivableRow[];
  const ledgerEntries = (ledgerData ?? []) as Array<{
    id: string; occurred_on: string; direction: string; kind: string;
    amount_twd: number; party: string | null; memo: string | null;
    state: string; created_at: string;
  }>;
  const allocations = (allocData ?? []) as Array<{
    worked_on: string; hours: number | null; user_id: string;
  }>;

  const ledgerSummary: LedgerSummary = {
    income: ledgerEntries.filter(e => e.direction === 'income').reduce((s, e) => s + e.amount_twd, 0),
    expense: ledgerEntries.filter(e => e.direction === 'expense').reduce((s, e) => s + e.amount_twd, 0),
    count: ledgerEntries.length,
  };

  const openReceivable = receivables.filter(r => r.status === 'open' && r.direction === 'receivable');
  const openPayable = receivables.filter(r => r.status === 'open' && r.direction === 'payable');
  const openTasks = tasks.filter(t => t.status === 'open');

  const timeline: TimelineEvent[] = [];
  for (const e of ledgerEntries.slice(0, 10)) {
    timeline.push({
      ts: e.occurred_on || e.created_at,
      kind: 'ledger',
      label: e.direction === 'income' ? '收款' : '支出',
      detail: `${e.party ?? ''} $${formatTwd(e.amount_twd)}`,
    });
  }
  for (const a of allocations.slice(0, 10)) {
    timeline.push({
      ts: a.worked_on,
      kind: 'allocation',
      label: '出勤',
      detail: a.hours ? `${a.hours}h` : '整天',
    });
  }
  timeline.sort((a, b) => b.ts.localeCompare(a.ts));
  const recentTimeline = timeline.slice(0, 15);

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-4 text-[12px]" style={{ color: 'var(--nm-text-muted)' }}>
        <Link href="/boss/sites" className="nm-focus hover:underline">專案管理</Link>
        <span className="mx-1.5">›</span>
        <span style={{ color: 'var(--nm-text-secondary)' }}>{s.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--nm-text-primary)' }}>{s.name}</h1>
          <div className="flex items-center gap-2 mt-1.5 text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>
            {categoryName && <span className="nm-pill nm-pill-neutral">{categoryName}</span>}
            {s.customer_name && <span>客戶: {s.customer_name}</span>}
            <span>{s.active
              ? <span style={{ color: 'var(--nm-success-glass-text)' }}>啟用中</span>
              : <span className="line-through" style={{ color: 'var(--nm-text-faint)' }}>已停用</span>
            }</span>
          </div>
        </div>
      </div>

      {/* Status cards (4 cols desktop, 2 cols mobile) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatusCard label="現場設備" value={String(equipment.length)} sub="件" />
        <StatusCard
          label="未完成任務"
          value={String(openTasks.length)}
          sub="項"
          tone={openTasks.length > 0 ? 'warning' : 'default'}
        />
        <StatusCard
          label="待收款"
          value={openReceivable.length > 0 ? `$${formatTwd(openReceivable.reduce((s, r) => s + r.total_amount_twd, 0))}` : '—'}
          sub={openReceivable.length > 0 ? `${openReceivable.length} 筆` : ''}
          tone={openReceivable.length > 0 ? 'warning' : 'default'}
        />
        <StatusCard
          label="待付款"
          value={openPayable.length > 0 ? `$${formatTwd(openPayable.reduce((s, r) => s + r.total_amount_twd, 0))}` : '—'}
          sub={openPayable.length > 0 ? `${openPayable.length} 筆` : ''}
        />
      </div>

      {/* Site knowledge strip */}
      <div className="mb-4">
        <SiteKnowledge siteId={id} notes={siteNotes} zones={noteZones} />
      </div>

      {/* Two-column layout: panels left, timeline right */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Left: panels */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          {/* Equipment panel */}
          <Panel title="現場設備" count={equipment.length}>
            {equipment.length === 0 ? (
              <EmptyHint>目前沒有設備在此專案</EmptyHint>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]" style={{ minWidth: 500, borderCollapse: 'collapse' }}>
                  <thead style={{ background: 'rgba(20,20,24,0.92)' }}>
                    <tr style={{ color: 'var(--nm-text-muted)' }}>
                      <th className="text-left py-2 px-3 font-normal text-[11px] leading-none tracking-[.14em]">名稱</th>
                      <th className="text-left py-2 px-3 font-normal text-[11px] leading-none tracking-[.14em]">品牌</th>
                      <th className="text-left py-2 px-3 font-normal text-[11px] leading-none tracking-[.14em]">類別</th>
                      <th className="text-right py-2 px-3 font-normal text-[11px] leading-none tracking-[.14em]">數量</th>
                    </tr>
                  </thead>
                  <tbody>
                    {equipment.map(eq => (
                      <tr key={eq.id} style={{ borderTop: '1px solid var(--nm-border-hair)' }}>
                        <td className="py-2 px-3">
                          <Link href={`/boss/equipment/${eq.id}`} className="hover:underline nm-focus" style={{ color: 'var(--nm-text-body)' }}>
                            {eq.name}
                          </Link>
                        </td>
                        <td className="py-2 px-3" style={{ color: 'var(--nm-text-secondary)' }}>{eq.brand ?? '—'}</td>
                        <td className="py-2 px-3" style={{ color: 'var(--nm-text-secondary)' }}>{EQUIPMENT_CATEGORY_LABEL[eq.category]}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{eq.quantity} {eq.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          {/* Financial summary */}
          <Panel title="帳務摘要" count={ledgerSummary.count}>
            {ledgerSummary.count === 0 ? (
              <EmptyHint>尚無帳務紀錄</EmptyHint>
            ) : (
              <div className="px-3 pb-3">
                <div className="flex gap-6 text-[13px] mb-3">
                  <div>
                    <div className="text-[11px] leading-none tracking-[.14em] mb-1" style={{ color: 'var(--nm-text-muted)' }}>收入</div>
                    <div className="text-lg font-semibold tabular-nums" style={{ color: 'var(--nm-success-glass-text)' }}>
                      ${formatTwd(ledgerSummary.income)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] leading-none tracking-[.14em] mb-1" style={{ color: 'var(--nm-text-muted)' }}>支出</div>
                    <div className="text-lg font-semibold tabular-nums" style={{ color: 'var(--nm-danger-glass-text)' }}>
                      ${formatTwd(ledgerSummary.expense)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] leading-none tracking-[.14em] mb-1" style={{ color: 'var(--nm-text-muted)' }}>毛利</div>
                    <div className="text-lg font-semibold tabular-nums" style={{ color: 'var(--nm-text-primary)' }}>
                      ${formatTwd(ledgerSummary.income - ledgerSummary.expense)}
                    </div>
                  </div>
                </div>

                {/* Receivables */}
                {receivables.length > 0 && (
                  <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--nm-border-hair)' }}>
                    <div className="text-[11px] leading-none tracking-[.14em] mb-2" style={{ color: 'var(--nm-text-muted)' }}>應收應付</div>
                    <div className="flex flex-col gap-1.5">
                      {receivables.map(r => (
                        <div key={r.id} className="flex items-center justify-between text-[13px]">
                          <div className="flex items-center gap-2">
                            <span className={`nm-pill ${r.direction === 'receivable' ? '' : 'nm-pill-muted'}`}
                              style={r.direction === 'receivable' ? { color: 'var(--nm-success-glass-text)', background: 'rgba(126,207,157,0.08)', borderColor: 'rgba(126,207,157,0.26)' } : undefined}>
                              {r.direction === 'receivable' ? '應收' : '應付'}
                            </span>
                            <span style={{ color: 'var(--nm-text-body)' }}>{r.party}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="tabular-nums" style={{ color: 'var(--nm-text-body)' }}>${formatTwd(r.total_amount_twd)}</span>
                            <span className={`nm-pill ${r.status === 'open' ? 'nm-pill-warning' : 'nm-pill-neutral'}`}>
                              {r.status === 'open' ? '未結' : '已結'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Panel>

          {/* Tasks */}
          <Panel title="任務" count={tasks.length}>
            {tasks.length === 0 ? (
              <EmptyHint>尚無任務紀錄</EmptyHint>
            ) : (
              <div className="px-3 pb-3 flex flex-col gap-1.5">
                {tasks.map(t => (
                  <div key={t.id} className="flex items-center justify-between text-[13px]">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="shrink-0 w-2 h-2 rounded-full"
                        style={{ background: t.status === 'open' ? 'var(--nm-warning)' : 'var(--nm-success)' }}
                      />
                      <span className="truncate" style={{ color: 'var(--nm-text-body)' }}>{t.title}</span>
                    </div>
                    <div className="shrink-0 flex items-center gap-2 ml-2">
                      {t.due_date && (
                        <span className="text-[11px] tabular-nums" style={{ color: 'var(--nm-text-muted)' }}>
                          {shortDate(t.due_date)}
                        </span>
                      )}
                      <span className={`nm-pill ${t.status === 'open' ? 'nm-pill-warning' : 'nm-pill-neutral'}`}>
                        {t.status === 'open' ? '進行中' : '完成'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        {/* Right: activity timeline (260px on desktop) */}
        <div className="lg:w-[260px] shrink-0">
          <div className="nm-raised-sm rounded-2xl p-3">
            <div className="text-[11px] leading-none tracking-[.14em] mb-3" style={{ color: 'var(--nm-text-muted)' }}>
              案子動態
            </div>
            {recentTimeline.length === 0 ? (
              <div className="text-[13px] py-4 text-center" style={{ color: 'var(--nm-text-faint)' }}>
                尚無動態
              </div>
            ) : (
              <div className="flex flex-col">
                {recentTimeline.map((ev, i) => (
                  <div key={i} className="flex gap-2.5 pb-3 relative" style={i < recentTimeline.length - 1 ? { borderLeft: '1px solid var(--nm-border-hair)', marginLeft: 4 } : { marginLeft: 4 }}>
                    <div
                      className="shrink-0 w-[9px] h-[9px] rounded-full -ml-[5px] mt-[3px]"
                      style={{ background: ev.kind === 'ledger' ? 'var(--nm-success)' : ev.kind === 'allocation' ? 'var(--nm-warning)' : 'var(--nm-text-muted)', border: '2px solid rgba(20,20,24,0.92)' }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-1">
                        <span className="text-[12px] font-medium" style={{ color: 'var(--nm-text-body)' }}>{ev.label}</span>
                        <span className="text-[10.5px] tabular-nums shrink-0" style={{ color: 'var(--nm-text-faint)' }}>{shortDate(ev.ts)}</span>
                      </div>
                      <div className="text-[12px] leading-[1.6] truncate" style={{ color: 'var(--nm-text-secondary)' }}>
                        {ev.detail}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusCard({ label, value, sub, tone = 'default' }: {
  label: string;
  value: string;
  sub: string;
  tone?: 'default' | 'warning' | 'danger';
}) {
  const valueColor = tone === 'danger' ? 'var(--nm-danger)'
    : tone === 'warning' ? 'var(--nm-warning-glass-text)'
    : 'var(--nm-text-primary)';
  return (
    <div className="nm-raised-sm rounded-2xl p-3">
      <div className="text-[11px] leading-none tracking-[.14em]" style={{ color: 'var(--nm-text-muted)' }}>{label}</div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span className="text-[22px] font-semibold tabular-nums" style={{ color: valueColor }}>{value}</span>
        {sub && <span className="text-[12px]" style={{ color: 'var(--nm-text-secondary)' }}>{sub}</span>}
      </div>
    </div>
  );
}

function Panel({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="nm-raised rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5" style={{ background: 'rgba(20,20,24,0.92)', borderBottom: '1px solid var(--nm-border-hair)' }}>
        <span className="text-[13px] font-medium" style={{ color: 'var(--nm-text-primary)' }}>{title}</span>
        <span className="text-[12px] tabular-nums" style={{ color: 'var(--nm-text-muted)' }}>{count}</span>
      </div>
      {children}
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[13px] py-6 text-center" style={{ color: 'var(--nm-text-faint)' }}>
      {children}
    </div>
  );
}
