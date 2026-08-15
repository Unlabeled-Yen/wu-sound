import Link from 'next/link';
import type { OverviewData, QueueItem, ProjectRow, CheckinRow, TodayLog } from '@/lib/overview-data';

// 總覽 v2(13a)桌機視圖。對應 design_handoff_wu_sound/11-overview.md §4 的視覺規格逐值照抄
// (grid-template-columns、字級表、顏色語意四色)。資料由 lib/overview-data.ts 算好,
// 這裡只負責排版與三態(有資料/資料不足/沒接上失敗,§5)。

const SEVERITY_BORDER: Record<QueueItem['severity'], string> = {
  breach: 'var(--nm-danger)',
  warning: 'var(--nm-warning)',
  normal: 'rgba(255,255,255,.14)',
};
const SEVERITY_VALUE_COLOR: Record<QueueItem['severity'], string> = {
  breach: 'var(--nm-danger-glass-text)',
  warning: 'var(--nm-warning-glass-text)',
  normal: 'var(--nm-text-primary)',
};

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl p-4 text-[13px]"
      style={{ background: 'rgba(224,122,122,0.08)', border: '1px solid rgba(224,122,122,0.34)', color: 'var(--nm-danger-glass-text)' }}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <div className="flex items-baseline justify-between mb-3">
      <span className="text-[10.5px] uppercase" style={{ letterSpacing: '.18em', color: 'var(--nm-text-muted)' }}>{children}</span>
      {note && <span className="text-[11.5px]" style={{ color: 'var(--nm-text-faint)' }}>{note}</span>}
    </div>
  );
}

export function OverviewDesktop({ data, month }: { data: OverviewData; month: string }) {
  const summarySentence =
    data.queueError
      ? null
      : data.decisionCount > 0
        ? <>今天有 <span style={{ color: 'var(--nm-warning)' }}>{data.decisionCount} 件</span> 事等你決定</>
        : '今天沒有需要你決定的事';

  return (
    <div className="flex flex-col gap-6">
      {/* 標題列 */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[11px] uppercase mb-1.5" style={{ letterSpacing: '.16em', color: 'var(--nm-text-muted)' }}>{data.dateLabel}</div>
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="text-[22px] font-semibold" style={{ letterSpacing: '-.01em', color: 'var(--nm-text-primary)' }}>總覽</span>
            {summarySentence && (
              <span className="text-[13.5px] whitespace-nowrap" style={{ color: 'var(--nm-text-secondary)' }}>{summarySentence}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <Link href={`/boss/ledger/new?month=${month}`} className="nm-btn text-[12.5px]" style={{ minHeight: 40, padding: '0 14px' }}>
            ＋ 記一筆
          </Link>
          {/* 老闆端寫日誌尚未接上(目前只有 staff/worklog 有寫入流程),先放視覺、不可互動,
              跟 app/boss/projects/[id]/QuickCaptureButton.tsx 旁邊那顆同款按鈕的既有作法一致。 */}
          <div
            className="text-[12.5px] flex items-center"
            style={{ minHeight: 40, padding: '0 14px', borderRadius: 12, background: 'rgba(40,40,46,.4)', border: '1px solid rgba(255,255,255,.2)', color: 'var(--nm-text-secondary)' }}
          >
            ＋ 寫日誌
          </div>
        </div>
      </div>

      {/* SSA 命令列(視覺骨架;04-ssa-agent.md 的 agent 後端與 /api/agent 尚未實作,見報告說明) */}
      <div className="rounded-2xl p-4" style={{ background: 'rgba(8,8,10,.28)', border: '1px solid var(--nm-border-hair)' }}>
        <div className="flex items-center gap-3">
          <div
            className="flex-1 flex items-center gap-2.5 px-4"
            style={{ minHeight: 44, borderRadius: 13, background: 'rgba(8,8,10,.4)', border: '1px solid rgba(255,255,255,.13)', boxShadow: 'inset 0 1px 3px rgba(0,0,0,.5)' }}
          >
            <GearIcon />
            <span className="text-[13.5px]" style={{ color: 'var(--nm-text-faint)' }}>問 SSA:中壢藝術館的吊點限制是多少?</span>
          </div>
          <div
            className="flex items-center justify-center shrink-0"
            style={{ width: 44, height: 44, borderRadius: 13, background: 'rgba(40,40,46,.4)', border: '1px solid rgba(255,255,255,.2)', color: 'var(--nm-text-secondary)' }}
          >
            <MicIcon />
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
          <Chip>阿凱這週去過哪些案場</Chip>
          <Chip>三號廳支架那張卡標成完成</Chip>
          <Chip>哪些設備還在維修</Chip>
          <span className="ml-auto text-[11.5px] self-center" style={{ color: 'var(--nm-text-faint)' }}>寫入前一律要你確認</span>
        </div>
      </div>

      {/* 需要你決定 */}
      <div>
        <SectionLabel note="依「擋住別人」排序,不是依模組">需要你決定</SectionLabel>
        {data.queueError ? (
          <ErrorBox>需要你決定讀取失敗:{data.queueError}</ErrorBox>
        ) : data.queue.length === 0 ? (
          <div className="rounded-2xl p-6 flex items-center gap-3" style={{ border: '1px solid rgba(255,255,255,.09)', background: 'rgba(8,8,10,.4)' }}>
            <CheckIcon />
            <span className="text-[13.5px]" style={{ color: 'var(--nm-text-secondary)' }}>今天沒有事情等你決定</span>
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,.09)', background: 'rgba(8,8,10,.4)' }}>
            {data.queue.map((item, i) => (
              <QueueRowView key={item.id} item={item} isLast={i === data.queue.length - 1} />
            ))}
          </div>
        )}
      </div>

      {/* 進行中的案子 | 今天現場 */}
      <div className="flex gap-5 items-stretch flex-col lg:flex-row">
        <div className="flex-[1.5] min-w-0">
          <SectionLabel note={data.projectsError ? undefined : `${data.projects.length} 個　·　依最近有動作排序`}>進行中的案子</SectionLabel>
          {data.projectsError ? (
            <ErrorBox>進行中的案子讀取失敗:{data.projectsError}</ErrorBox>
          ) : data.projects.length === 0 ? (
            <div className="rounded-2xl p-6" style={{ border: '1px solid rgba(255,255,255,.09)', background: 'rgba(8,8,10,.4)' }}>
              <span className="text-[13.5px]" style={{ color: 'var(--nm-text-secondary)' }}>目前沒有進行中的案子</span>
            </div>
          ) : (
            <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,.09)', background: 'rgba(8,8,10,.4)' }}>
              <div
                className="grid px-[18px] py-[11px] text-[10px] uppercase"
                style={{ gridTemplateColumns: '180px 1fr 96px', columnGap: 16, letterSpacing: '.16em', color: 'var(--nm-text-muted)', borderBottom: '1px solid rgba(255,255,255,.07)' }}
              >
                <span>案子</span>
                <span>最近動態</span>
                <span className="text-right">在場設備</span>
              </div>
              {data.projects.map((p, i) => (
                <ProjectRowView key={p.id} p={p} isLast={i === data.projects.length - 1} />
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 rounded-2xl flex flex-col p-5" style={{ border: '1px solid rgba(255,255,255,.09)', background: 'rgba(8,8,10,.4)' }}>
          <div className="flex items-baseline justify-between mb-3.5">
            <span className="text-[13px] font-medium" style={{ color: 'var(--nm-text-body)' }}>今天現場</span>
            <span className="text-[11px]" style={{ color: 'var(--nm-text-muted)', fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace' }}>{data.nowLabel}</span>
          </div>

          {data.checkinsError ? (
            <ErrorBox>打卡讀取失敗:{data.checkinsError}</ErrorBox>
          ) : data.checkins.length === 0 ? (
            <span className="text-[12.5px]" style={{ color: 'var(--nm-text-faint)' }}>今天還沒有人打卡</span>
          ) : (
            <div className="flex flex-col gap-2.5">
              {data.checkins.map((c) => <CheckinRowView key={c.userId} c={c} />)}
            </div>
          )}

          <div style={{ margin: '16px 0', borderTop: '1px solid rgba(255,255,255,.07)' }} />

          <div className="text-[10.5px] uppercase mb-[11px]" style={{ letterSpacing: '.16em', color: 'var(--nm-text-muted)' }}>
            今天的日誌　{data.worklogsError ? '—' : `${data.todayLogCount} 則`}
          </div>
          {data.worklogsError ? (
            <ErrorBox>日誌讀取失敗:{data.worklogsError}</ErrorBox>
          ) : data.todayLogs.length === 0 ? (
            <span className="text-[12.5px]" style={{ color: 'var(--nm-text-faint)' }}>今天還沒有人寫日誌</span>
          ) : (
            <div className="flex flex-col gap-2.5">
              {data.todayLogs.map((l) => <TodayLogView key={l.id} l={l} />)}
            </div>
          )}

          <div className="mt-auto pt-4">
            <Link href="/boss/worklogs" className="text-[12px]" style={{ color: 'var(--nm-text-secondary)' }}>全部工作記錄　›</Link>
          </div>
        </div>
      </div>

      {/* 設備三格(在場/庫房/維修中;第四格「下週要用但不在庫房」需要 day_site_allocations,故意不渲染) */}
      <div>
        <SectionLabel>設備</SectionLabel>
        {data.equipmentError || !data.equipment ? (
          <ErrorBox>設備讀取失敗:{data.equipmentError}</ErrorBox>
        ) : (
          <div className="rounded-2xl flex" style={{ border: '1px solid rgba(255,255,255,.09)', background: 'rgba(8,8,10,.4)' }}>
            <EquipmentTile
              label="在場"
              value={data.equipment.onSiteQty}
              hint={`件在${data.equipment.onSiteSiteCount}個案場`}
              bordered
            />
            <EquipmentTile
              label="庫房"
              value={data.equipment.storageQty}
              hint="件可調度"
              bordered
            />
            <EquipmentTile
              label="維修中"
              value={data.equipment.repairQty}
              hint={data.equipment.repairMaxDays !== null ? `件已 ${data.equipment.repairMaxDays} 天` : '件'}
              attention={data.equipment.repairQty > 0}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function QueueRowView({ item, isLast }: { item: QueueItem; isLast: boolean }) {
  return (
    <div
      data-queue-row
      data-severity={item.severity}
      className="grid items-center px-5 py-3.5"
      style={{
        gridTemplateColumns: '1fr 120px 150px',
        columnGap: 18,
        borderLeft: `2px solid ${SEVERITY_BORDER[item.severity]}`,
        borderBottom: isLast ? undefined : '1px solid rgba(255,255,255,.05)',
      }}
    >
      <div className="min-w-0">
        <div className="text-[13.5px] leading-[1.4]" style={{ color: 'var(--nm-text-primary)' }}>
          {item.primary}
          <span className="ml-2.5 text-[11.5px]" style={{ color: 'var(--nm-text-muted)' }}>{item.moduleTag}</span>
        </div>
        <div className="text-[11.5px] leading-[1.5] mt-[3px]" style={{ color: 'var(--nm-text-secondary)' }}>{item.secondary}</div>
      </div>
      <span
        className="text-right text-[14px] font-semibold tabular-nums"
        style={{ fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace', color: SEVERITY_VALUE_COLOR[item.severity] }}
      >
        {item.value}
      </span>
      <Link
        href={item.actionHref}
        className={item.actionSolid ? 'nm-btn-solid' : 'nm-btn'}
        style={{ justifySelf: 'end', minHeight: 36, padding: '0 14px', borderRadius: 11, fontSize: 12.5 }}
      >
        {item.actionLabel}
      </Link>
    </div>
  );
}

function ProjectRowView({ p, isLast }: { p: ProjectRow; isLast: boolean }) {
  return (
    <div
      className="grid items-center px-[18px] py-3.5"
      style={{ gridTemplateColumns: '180px 1fr 96px', columnGap: 16, borderBottom: isLast ? undefined : '1px solid rgba(255,255,255,.05)' }}
    >
      <div className="min-w-0">
        <div className="text-[13.5px] leading-[1.35] truncate" style={{ color: 'var(--nm-text-primary)' }}>{p.name}</div>
        {p.location && <div className="text-[11px] leading-[1.4] mt-0.5 truncate" style={{ color: 'var(--nm-text-muted)' }}>{p.location}</div>}
      </div>
      <div className="min-w-0 text-[12.5px] leading-[1.5] truncate" style={{ color: p.hasActivity ? 'var(--nm-text-secondary)' : 'var(--nm-text-faint)' }}>
        {p.latestActivity}
      </div>
      <span
        className="text-right text-[13px] tabular-nums"
        style={{ fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace', color: 'var(--nm-text-secondary)' }}
      >
        {p.onSiteCount}
      </span>
    </div>
  );
}

function CheckinRowView({ c }: { c: CheckinRow }) {
  const clockedIn = c.time !== null;
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="shrink-0 rounded-full text-center"
        style={{
          width: 22, height: 22, lineHeight: '22px', fontSize: 10, fontWeight: 500,
          background: clockedIn ? '#3a3a42' : '#2c2c33',
          color: clockedIn ? 'var(--nm-text-body)' : 'var(--nm-text-muted)',
        }}
      >
        {c.name.slice(0, 1)}
      </span>
      <span className="flex-1 text-[13px] leading-[1.4] truncate" style={{ color: clockedIn ? 'var(--nm-text-body)' : 'var(--nm-text-muted)' }}>
        {c.name}
      </span>
      <span
        className="text-[11px]"
        style={{ fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace', color: clockedIn ? 'var(--nm-success-glass-text)' : 'var(--nm-warning-glass-text)' }}
      >
        {clockedIn ? c.time : '未打卡'}
      </span>
    </div>
  );
}

function TodayLogView({ l }: { l: TodayLog }) {
  return (
    <div className="text-[12.5px] leading-[1.6]" style={{ color: 'var(--nm-text-secondary)' }}>
      <span className="mr-2" style={{ fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace', color: 'var(--nm-text-muted)' }}>{l.time}</span>
      {l.note}
    </div>
  );
}

function EquipmentTile({ label, value, hint, bordered, attention }: { label: string; value: number; hint: string; bordered?: boolean; attention?: boolean }) {
  return (
    <div
      className="flex-1 px-5 py-4"
      style={bordered ? { borderRight: '1px solid rgba(255,255,255,.07)' } : undefined}
    >
      <div className="text-[12px] mb-2.5" style={{ color: attention ? 'var(--nm-warning)' : 'var(--nm-text-muted)' }}>{label}</div>
      <div className="flex items-baseline gap-2">
        <span
          className="text-[26px] font-semibold tabular-nums"
          style={{ fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace', color: attention ? 'var(--nm-warning-glass-text)' : 'var(--nm-text-primary)' }}
        >
          {value}
        </span>
        <span className="text-[12px]" style={{ color: 'var(--nm-text-muted)' }}>{hint}</span>
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="text-[12px]"
      style={{ padding: '7px 12px', borderRadius: 999, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', color: 'var(--nm-text-secondary)' }}
    >
      {children}
    </span>
  );
}

function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--nm-text-muted)" strokeWidth="1.75" strokeLinecap="round">
      <path d="M12 3v3M12 18v3M4.2 7.5l2.6 1.5M17.2 15l2.6 1.5M4.2 16.5l2.6-1.5M17.2 9l2.6-1.5" />
      <circle cx="12" cy="12" r="3.2" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
      <path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--nm-text-faint)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
