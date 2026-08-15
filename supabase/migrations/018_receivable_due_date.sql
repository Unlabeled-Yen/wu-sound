-- 帳務首頁改版(docs/handoff/01-ledger-home):「未來四週現金」要依應收/應付的約定
-- 收款日/到期日分桶,但 receivables 表從沒有任何日期欄位——新增/編輯約定的表單
-- 也從沒讓人填過。這支 migration 只加骨架,不回填舊資料:
--
--   - 新欄位 nullable,舊約定一律是 NULL,不是「今天到期」也不是「本週」。
--   - 分桶邏輯(web/lib/ledger-cash-forecast.ts)必須把 NULL 獨立列成「未排定」桶,
--     不可以塞進任何一週,也不可以用建立時間或其他欄位偷偷推算——那是換一種方式
--     假裝有資料,一樣違反「缺資料就 loud」的原則。
--
-- ⚠️ 尚未在真 postgres 環境跑過,套用前依專案慣例先在含代表性資料的副本演練。

alter table receivables
  add column agreed_due_date date;

comment on column receivables.agreed_due_date is
  '約定收款日(應收)或到期日(應付)。可為 NULL——2026-08 前建立的約定全部是 NULL,
   代表「當時沒有約定明確日期」,不是「今天到期」。任何依此欄位做的分桶/排序都要
   把 NULL 明確列成獨立一組,不可預設塞進最近一週。';

-- receivable_payment_state 是明確列欄位的 view(見 015),不是 select *,
-- 加欄位後要重建才會出現在讀取端。
create or replace view receivable_payment_state as
select
  r.id,
  r.direction,
  r.party,
  r.site_id,
  r.total_amount_twd,
  r.memo,
  r.status,
  r.agreed_due_date,
  r.created_by,
  r.created_at,
  r.updated_at,
  coalesce(settled.settled_twd, 0) as settled_twd,
  r.total_amount_twd - coalesce(settled.settled_twd, 0) as remaining_twd,
  coalesce(settled.settled_twd, 0) > r.total_amount_twd as overpaid
from receivables r
left join (
  -- 只認 posted 為已結,對齊 017 對這個 view 的粒度修正。
  select receivable_id, sum(amount_twd) as settled_twd
  from ledger_entries
  where receivable_id is not null and state = 'posted'
  group by receivable_id
) settled on settled.receivable_id = r.id;

comment on view receivable_payment_state is
  '應收應付派生未結狀態,見 015 的原始說明。018 加入 agreed_due_date 供帳務首頁
   的未來四週現金分桶使用——NULL 值原樣穿透,讀取端負責歸類為「未排定」。';

-- === 驗證查詢 ===
-- select agreed_due_date, count(*) from receivable_payment_state where status = 'open' group by 1 order by 1;
