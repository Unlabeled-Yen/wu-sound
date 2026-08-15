'use client';

import { useMemo, useState } from 'react';
import type { PlacebookData, PlaceRow, SiteCategoryOption, WeekSlot } from '@/lib/placebook-data';
import { createSite, createSiteCategory, renameSite, setSiteActive, updateSiteMeta } from './actions';

function relDate(dateStr: string, today: string): string {
  if (dateStr === today) return '今天';
  const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
  const d = new Date(`${dateStr}T00:00:00Z`);
  return `週${WEEKDAYS[d.getUTCDay()]}`;
}

function EdgeBar({ todayHere, weekHere }: { todayHere: boolean; weekHere: boolean }) {
  const color = todayHere ? '#7ecf9d' : weekHere ? 'rgba(217,181,107,.6)' : 'rgba(255,255,255,.14)';
  return <span className="shrink-0" style={{ width: 2, alignSelf: 'stretch', background: color, borderRadius: 1 }} />;
}

function statusSentence(p: PlaceRow): { text: string; color: string } | null {
  if (p.todayHere) return { text: '今天有人在', color: 'var(--nm-success-glass-text)' };
  if (p.blockedTaskCount !== null && p.blockedTaskCount > 0) {
    return { text: `${p.blockedTaskCount} 件卡住等你拍板`, color: 'var(--nm-danger-glass-text)' };
  }
  return null;
}

// 新增案子面板——原本「全部專案」分頁的表單整批搬進地點簿本身(2026-08-15
// 決定:地點簿取代全部專案,不再是兩個分頁,新增/管理類別也收進這裡)。
function NewProjectPanel({ categories }: { categories: SiteCategoryOption[] }) {
  const [open, setOpen] = useState(false);
  const [manageCategories, setManageCategories] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="nm-btn-solid text-[13px] shrink-0">
        ＋ 新增案子
      </button>
    );
  }

  return (
    <div className="rounded-2xl nm-raised-sm p-3.5 mb-4">
      <form action={createSite} className="flex gap-2 items-center flex-wrap mb-2.5">
        <input name="name" required placeholder="案子名稱" className="flex-1 nm-input text-[13px]" style={{ minWidth: 160 }} />
        <select name="category_id" className="nm-input text-[13px]" style={{ width: 'auto' }}>
          <option value="">類別:未設</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <input name="customer_name" placeholder="客戶(選填)" className="nm-input text-[13px]" style={{ width: 140 }} />
        <button type="submit" className="nm-btn-solid text-[13px]">新增</button>
        <button type="button" onClick={() => setOpen(false)} className="nm-btn text-[13px]">取消</button>
      </form>
      <button
        type="button"
        onClick={() => setManageCategories((v) => !v)}
        className="text-[12px] underline"
        style={{ color: 'var(--nm-text-muted)' }}
      >
        {manageCategories ? '收起類別管理' : '管理類別'}
      </button>
      {manageCategories && (
        <div className="mt-2.5 pt-2.5" style={{ borderTop: '1px solid rgba(255,255,255,.07)' }}>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {categories.length === 0 ? (
              <span className="text-[12px]" style={{ color: 'var(--nm-text-faint)' }}>還沒有類別</span>
            ) : (
              categories.map((c) => <span key={c.id} className="nm-pill nm-pill-neutral">{c.name}</span>)
            )}
          </div>
          <form action={createSiteCategory} className="flex gap-2 items-center max-w-sm">
            <input name="name" required placeholder="新增類別名稱" className="flex-1 nm-input text-[13px]" />
            <button type="submit" className="nm-btn text-[13px]">新增類別</button>
          </form>
        </div>
      )}
    </div>
  );
}

function PlaceSubRow({ project, categories }: { project: PlaceRow['projects'][number]; categories: SiteCategoryOption[] }) {
  const [editing, setEditing] = useState(false);
  const cannotDeactivate = project.active && project.onSiteEquipmentQty > 0;

  return (
    <div style={{ padding: '9px 0 9px 14px', borderLeft: '1px solid rgba(255,255,255,.12)' }}>
      <div className="flex items-center gap-2.5 flex-wrap">
        <span className="text-[12.5px]" style={{ color: 'var(--nm-text-body)' }}>{project.name}</span>
        {project.categoryName && (
          <span className="text-[10px]" style={{ padding: '3px 8px', borderRadius: 5, background: 'rgba(255,255,255,.07)', color: 'var(--nm-text-secondary)' }}>
            {project.categoryName}
          </span>
        )}
        {!project.active && (
          <span className="text-[11.5px]" style={{ color: 'var(--nm-text-faint)' }}>已停用</span>
        )}
        {project.pendingTaskCount !== null && project.pendingTaskCount > 0 && (
          <span className="text-[11.5px]" style={{ color: 'var(--nm-warning-glass-text)' }}>{project.pendingTaskCount} 件未完成</span>
        )}
        <button
          type="button"
          onClick={() => setEditing((e) => !e)}
          className="text-[11px] underline ml-auto shrink-0"
          style={{ color: 'var(--nm-text-muted)' }}
        >
          {editing ? '收起' : '編輯'}
        </button>
      </div>

      {editing && (
        <div className="mt-2 flex flex-col gap-2 max-w-md">
          <form action={renameSite} className="flex items-center gap-2">
            <input type="hidden" name="id" value={project.id} />
            <input name="name" defaultValue={project.name} className="flex-1 nm-input text-[12.5px]" />
            <button type="submit" className="nm-btn text-[12px] shrink-0">存名稱</button>
          </form>
          <form action={updateSiteMeta} className="flex items-center gap-2 flex-wrap">
            <input type="hidden" name="id" value={project.id} />
            <select name="category_id" defaultValue={project.categoryId ?? ''} className="nm-input text-[12.5px]" style={{ width: 'auto' }}>
              <option value="">類別:未設</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <input name="customer_name" defaultValue={project.customerName ?? ''} placeholder="客戶" className="nm-input text-[12.5px]" style={{ width: 110 }} />
            <button type="submit" className="nm-btn text-[12px] shrink-0">存類別/客戶</button>
          </form>
          <form action={setSiteActive}>
            <input type="hidden" name="id" value={project.id} />
            <input type="hidden" name="active" value={project.active ? 'false' : 'true'} />
            <button
              type="submit"
              disabled={cannotDeactivate}
              className="nm-btn text-[12px] disabled:opacity-40"
              title={cannotDeactivate ? '有設備在此案場,請先把設備移回庫房再停用' : ''}
            >
              {project.active ? '停用此案子' : '啟用此案子'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function PlaceListRow({ place, today, defaultExpanded, categories }: { place: PlaceRow; today: string; defaultExpanded: boolean; categories: SiteCategoryOption[] }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const sentence = statusSentence(place);

  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,.05)' }}>
      <button
        type="button"
        data-place-row
        data-active={place.activeCount}
        onClick={() => setExpanded((e) => !e)}
        className="w-full text-left flex items-stretch gap-3"
        style={{ background: place.todayHere ? 'rgba(126,207,157,.05)' : undefined }}
      >
        <EdgeBar todayHere={place.todayHere} weekHere={place.weekHere} />
        <div
          className="flex-1 grid items-center"
          style={{ gridTemplateColumns: '1fr 108px 96px 108px 116px', columnGap: 18, padding: '14px 16px 14px 0' }}
        >
          <div className="min-w-0">
            <div className="text-[14px] font-medium truncate" style={{ color: 'var(--nm-text-primary)' }}>{place.label}</div>
            {sentence && <div className="text-[11px] mt-0.5" style={{ color: sentence.color }}>{sentence.text}</div>}
          </div>
          <span className="text-[13.5px] tabular-nums text-right" style={{ color: place.activeCount > 0 ? 'var(--nm-success-glass-text)' : 'var(--nm-text-muted)', fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace' }}>
            {place.activeCount}
          </span>
          <span className="text-[13px] tabular-nums text-right" style={{ color: place.onSiteEquipmentQty && place.onSiteEquipmentQty > 0 ? 'var(--nm-warning-glass-text)' : 'var(--nm-text-secondary)', fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace' }}>
            {place.onSiteEquipmentQty && place.onSiteEquipmentQty > 0 ? place.onSiteEquipmentQty : '—'}
          </span>
          <span className="text-[13px] tabular-nums text-right" style={{ color: 'var(--nm-text-secondary)', fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace' }}>
            {place.knowledgeCount}
          </span>
          <span className="text-[12px] tabular-nums text-right" style={{ color: place.lastVisit === today ? 'var(--nm-success-glass-text)' : 'var(--nm-text-secondary)', fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace' }}>
            {place.lastVisit ? (place.lastVisit === today ? '今天' : place.lastVisit.slice(5)) : '沒去過'}
          </span>
        </div>
      </button>
      {expanded && (
        <div style={{ padding: '0 16px 10px 16px' }}>
          {place.projects.map((p) => <PlaceSubRow key={p.id} project={p} categories={categories} />)}
        </div>
      )}
    </div>
  );
}

function ThisWeekRow({ slots, today }: { slots: WeekSlot[]; today: string }) {
  if (slots.length === 0) return null;
  return (
    <div className="rounded-2xl p-4 mb-4" style={{ border: '1px solid rgba(255,255,255,.09)', background: 'rgba(8,8,10,.4)' }}>
      <div className="flex items-baseline justify-between mb-2.5">
        <span className="text-[10.5px] uppercase" style={{ letterSpacing: '.18em', color: 'var(--nm-text-muted)' }}>本週要進場</span>
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${slots.length}, 1fr)` }}>
        {slots.map((s) => (
          <div key={s.date}>
            <div className="text-[11.5px] font-semibold tabular-nums mb-1" style={{ color: s.isToday ? 'var(--nm-text-primary)' : 'var(--nm-text-body)', fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace' }}>
              {relDate(s.date, today)}
            </div>
            <div className="text-[12.5px] leading-[1.45] truncate" style={{ color: 'var(--nm-text-body)' }}>{s.siteName}</div>
            <div className="text-[11px] leading-[1.45] truncate" style={{ color: s.userNames.length > 0 ? 'var(--nm-text-secondary)' : 'var(--nm-warning-glass-text)' }}>
              {s.userNames.length > 0 ? s.userNames.join('、') : '還沒排人'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PlacebookBoard({ data }: { data: PlacebookData }) {
  const [query, setQuery] = useState('');
  const [dormantOpen, setDormantOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10); // 僅用於畫面高亮比對,實際資料計算在伺服器端已用台北時區

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return data.places;
    return data.places.filter((p) => p.label.includes(q) || p.projects.some((pr) => pr.name.includes(q)));
  }, [data.places, query]);

  const active = filtered.filter((p) => !p.dormant);
  const dormant = filtered.filter((p) => p.dormant);

  if (data.places.length === 0) {
    return (
      <div className="rounded-2xl nm-raised p-8 text-center">
        <p className="text-[13.5px] mb-3" style={{ color: 'var(--nm-text-secondary)' }}>還沒有任何地點</p>
        <NewProjectPanel categories={data.categories} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2.5 mb-4 flex-wrap">
        <div className="nm-inset flex-1" style={{ borderRadius: 12, minHeight: 38, display: 'flex', alignItems: 'center', padding: '0 12px', maxWidth: 320 }}>
          <SearchIcon />
          <input
            data-search
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="找地點…"
            className="flex-1 bg-transparent outline-none text-[13px] ml-2"
            style={{ color: 'var(--nm-text-body)' }}
          />
        </div>
        <NewProjectPanel categories={data.categories} />
      </div>

      <ThisWeekRow slots={data.weekSlots} today={today} />

      <div className="rounded-2xl nm-raised overflow-hidden" data-place-table>
        <div
          className="grid px-4"
          style={{ gridTemplateColumns: '10px 1fr 108px 96px 108px 116px', columnGap: 18, padding: '11px 16px', borderBottom: '1px solid rgba(255,255,255,.07)' }}
        >
          <span />
          <span className="text-[10px] uppercase" style={{ letterSpacing: '.16em', color: 'var(--nm-text-muted)' }}>地點・客戶</span>
          <span className="text-[10px] uppercase text-right" style={{ letterSpacing: '.16em', color: 'var(--nm-text-muted)' }}>進行中</span>
          <span className="text-[10px] uppercase text-right" style={{ letterSpacing: '.16em', color: 'var(--nm-text-muted)' }}>在場設備</span>
          <span className="text-[10px] uppercase text-right" style={{ letterSpacing: '.16em', color: 'var(--nm-text-muted)' }}>場地知識</span>
          <span className="text-[10px] uppercase text-right" style={{ letterSpacing: '.16em', color: 'var(--nm-text-muted)' }}>最後去</span>
        </div>

        {active.map((p) => (
          <PlaceListRow key={p.key} place={p} today={today} defaultExpanded={p.todayHere} categories={data.categories} />
        ))}

        {dormant.length > 0 && (
          <div style={{ borderTop: '1px solid rgba(255,255,255,.05)' }}>
            {dormantOpen ? (
              dormant.map((p) => <PlaceListRow key={p.key} place={p} today={today} defaultExpanded={false} categories={data.categories} />)
            ) : (
              <button
                type="button"
                data-dormant
                data-count={dormant.length}
                onClick={() => setDormantOpen(true)}
                className="w-full text-center py-3 text-[12.5px]"
                style={{ color: 'var(--nm-text-secondary)' }}
              >
                還有 {dormant.length} 個地方(休眠)　展開
              </button>
            )}
          </div>
        )}
        {dormant.length === 0 && <span data-dormant data-count={0} className="hidden" />}
      </div>

      <div className="flex items-center gap-4 mt-3 text-[12px]" style={{ color: 'var(--nm-text-faint)' }}>
        <span className="flex items-center gap-1.5"><span style={{ width: 8, height: 8, borderRadius: 2, background: '#7ecf9d', display: 'inline-block' }} />今天有人在</span>
        <span className="flex items-center gap-1.5"><span style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(217,181,107,.6)', display: 'inline-block' }} />本週要去</span>
        <span className="flex items-center gap-1.5"><span style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(255,255,255,.14)', display: 'inline-block' }} />沒有排程</span>
      </div>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--nm-text-muted)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
