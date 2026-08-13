import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 這個頁面是純渲染器——項目清單、說明、狀態、程式碼連結全部來自
// tender-radar 的 /api/meta/bid-plan。wu-sound 是公開 repo,不得在這裡
// 寫死任何策略性文字(項目名稱、內部代號、引擎說明)。

type ItemStatus =
  | 'done'
  | 'backfilling'
  | 'parser_missing'
  | 'bug'
  | 'needs_docs'
  | 'internal'
  | 'not_started'
  | 'partial';

interface Coverage {
  value: number;
  unfetched: number;
  withheld: number;
  fetch_failed: number;
}

interface CodeLink {
  label: string;
  url: string;
}

interface BidPlanSample {
  job_number: string;
  value: unknown;
}

interface BidPlanItem {
  key: string;
  title: string;
  status: ItemStatus;
  note: string | null;
  coverage: Coverage | null;
  samples: BidPlanSample[];
  code_links: CodeLink[];
}

interface BidPlanDatabase {
  key: string;
  title: string;
  items: BidPlanItem[];
}

interface BidPlanResponse {
  generated_at: string;
  config_reviewed_at: string;
  databases: BidPlanDatabase[];
}

interface LoadResult {
  plan: BidPlanResponse | null;
  error: string | null;
}

async function loadBidPlan(): Promise<LoadResult> {
  const base = process.env.TENDER_RADAR_API_URL;
  const token = process.env.TENDER_RADAR_API_TOKEN;
  if (!base || !token) {
    return { plan: null, error: '標案雷達連線尚未設定(缺 TENDER_RADAR_API_URL/TOKEN)' };
  }

  try {
    const res = await fetch(`${base}/api/meta/bid-plan`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) {
      return { plan: null, error: `標案雷達回應異常:HTTP ${res.status}` };
    }
    const json = (await res.json()) as BidPlanResponse;
    return { plan: json, error: null };
  } catch (err) {
    return { plan: null, error: `連線標案雷達失敗:${err instanceof Error ? err.message : String(err)}` };
  }
}

const STATUS_LABEL: Record<ItemStatus, string> = {
  done: '已就緒',
  backfilling: '回填中',
  parser_missing: '解析未寫',
  bug: '已知 bug',
  needs_docs: '待招標文件',
  internal: '內部建檔',
  not_started: '未開始',
  partial: '部分完成',
};

// 沿用現有 nm-* 設計系統的三色語意,不另起爐灶(--nm-success/--nm-warning/
// --nm-danger 定義在 app/globals.css)。parser_missing/not_started/internal
// 用跟「標案監測」頁 notice_type 徽章相同的中性灰。
const STATUS_STYLE: Record<ItemStatus, { bg: string; fg: string }> = {
  done: { bg: 'rgba(126, 207, 157, 0.16)', fg: 'var(--nm-success-glass-text)' },
  backfilling: { bg: 'rgba(217, 181, 107, 0.16)', fg: 'var(--nm-warning-glass-text)' },
  partial: { bg: 'rgba(217, 181, 107, 0.16)', fg: 'var(--nm-warning-glass-text)' },
  needs_docs: { bg: 'rgba(217, 181, 107, 0.16)', fg: 'var(--nm-warning-glass-text)' },
  bug: { bg: 'rgba(224, 122, 122, 0.16)', fg: 'var(--nm-danger-glass-text)' },
  parser_missing: { bg: 'rgba(156,146,147,0.14)', fg: 'var(--nm-text-secondary)' },
  not_started: { bg: 'rgba(156,146,147,0.14)', fg: 'var(--nm-text-secondary)' },
  internal: { bg: 'rgba(156,146,147,0.14)', fg: 'var(--nm-text-secondary)' },
};

function StatusBadge({ status }: { status: ItemStatus }) {
  const style = STATUS_STYLE[status];
  return (
    <span
      className="rounded-full px-2 py-0.5 text-xs shrink-0"
      style={{ background: style.bg, color: style.fg }}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function CoverageBar({ coverage }: { coverage: Coverage }) {
  const total = coverage.value + coverage.unfetched + coverage.withheld + coverage.fetch_failed;
  if (total === 0) {
    return <span className="text-xs" style={{ color: 'var(--nm-text-faint)' }}>尚無資料</span>;
  }
  const pct = Math.round((coverage.value / total) * 100);
  return (
    <span className="tabular-nums text-xs" style={{ color: 'var(--nm-text-secondary)' }}>
      {coverage.value.toLocaleString('zh-TW')} / {total.toLocaleString('zh-TW')}({pct}%)
    </span>
  );
}

function ItemRow({ item }: { item: BidPlanItem }) {
  const canExpand = item.coverage !== null || item.samples.length > 0 || item.code_links.length > 0;

  const header = (
    <div className="flex flex-wrap items-center gap-2 py-2">
      <span className="text-[13px]" style={{ color: 'var(--nm-text-body)' }}>{item.title}</span>
      <StatusBadge status={item.status} />
      {item.coverage && (
        <span className="ml-auto">
          <CoverageBar coverage={item.coverage} />
        </span>
      )}
    </div>
  );

  if (!canExpand) {
    return <li className="border-b last:border-b-0" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>{header}</li>;
  }

  return (
    <li className="border-b last:border-b-0" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
      <details className="group">
        <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">{header}</summary>
        <div className="pb-3 pl-1 text-xs space-y-2" style={{ color: 'var(--nm-text-secondary)' }}>
          {item.note && <p>{item.note}</p>}
          {item.coverage && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 tabular-nums">
              <span>value {item.coverage.value.toLocaleString('zh-TW')}</span>
              <span>unfetched {item.coverage.unfetched.toLocaleString('zh-TW')}</span>
              <span>withheld {item.coverage.withheld.toLocaleString('zh-TW')}</span>
              <span>fetch_failed {item.coverage.fetch_failed.toLocaleString('zh-TW')}</span>
            </div>
          )}
          {item.samples.length > 0 && (
            <ul className="space-y-0.5">
              {item.samples.map((s, i) => (
                <li key={i} className="tabular-nums">
                  {s.job_number}{s.value !== null && s.value !== undefined ? `:${String(s.value)}` : ''}
                </li>
              ))}
            </ul>
          )}
          {item.code_links.length > 0 && (
            <div className="flex flex-wrap gap-x-3">
              {item.code_links.map((link) => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                  style={{ color: 'var(--nm-text-faint)' }}
                >
                  {link.label}(需 GitHub 權限) →
                </a>
              ))}
            </div>
          )}
        </div>
      </details>
    </li>
  );
}

function DatabaseSection({ database }: { database: BidPlanDatabase }) {
  return (
    <section className="rounded-2xl nm-raised p-4">
      <h2 className="mb-1 text-base font-semibold" style={{ color: 'var(--nm-text-primary)' }}>
        {database.title}
      </h2>
      <ul>
        {database.items.map((item) => (
          <ItemRow key={item.key} item={item} />
        ))}
      </ul>
    </section>
  );
}

export default async function BossBidPlanPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'boss') redirect('/staff');

  const { plan, error } = await loadBidPlan();

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--nm-text-primary)' }}>資料進度板</h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--nm-text-secondary)' }}>
            {plan ? `最後盤點 ${plan.config_reviewed_at}` : '給開發者看的資料工程進度'}
          </p>
        </div>
        <a href="/boss/tenders/monitor" className="text-xs underline" style={{ color: 'var(--nm-text-faint)' }}>
          → 標案監測
        </a>
      </header>

      {error && (
        <div
          className="mb-4 rounded-xl p-3 text-[13px]"
          style={{
            background: 'rgba(224, 122, 122, 0.08)',
            border: '1px solid rgba(224, 122, 122, 0.34)',
            color: 'var(--nm-danger-glass-text)',
          }}
        >
          {error}
        </div>
      )}

      {plan && (
        <div className="space-y-4">
          {plan.databases.map((database) => (
            <DatabaseSection key={database.key} database={database} />
          ))}
        </div>
      )}
    </div>
  );
}
