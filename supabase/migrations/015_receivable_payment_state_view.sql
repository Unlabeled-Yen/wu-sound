-- 帳務 v3 批1(資料地基,第二步):應收應付派生視圖。對應 docs/ledger-v3-spec-v1.md 修正版
-- (原 spec 打算把 receivables 併入 ledger_entries,014 的頭注已記錄為何改弦更張)。
--
-- receivables 表繼續保留,不搬移任何資料 —— 這支 migration 只新增一個唯讀 view,
-- 把「未結金額怎麼算」從應用層(web/lib/receivables-query.ts)搬進 DB,對齊
-- 「DB 算總數,前端不自己加」憲章。UI 從獨立頁面改掛帳簿卡,是讀取端的事,
-- 不需要任何 schema 變更。
--
-- ⚠️ 尚未在真 postgres 環境跑過,套用前依專案慣例先在含代表性資料的副本演練
-- (至少一張未結、一張已結清、一張超收/超付)。

create or replace view receivable_payment_state as
select
  r.id,
  r.direction,
  r.party,
  r.site_id,
  r.total_amount_twd,
  r.memo,
  r.status,
  r.created_by,
  r.created_at,
  r.updated_at,
  coalesce(settled.settled_twd, 0) as settled_twd,
  r.total_amount_twd - coalesce(settled.settled_twd, 0) as remaining_twd,
  coalesce(settled.settled_twd, 0) > r.total_amount_twd as overpaid
from receivables r
left join (
  select receivable_id, sum(amount_twd) as settled_twd
  from ledger_entries
  where receivable_id is not null and state <> 'voided'
  group by receivable_id
) settled on settled.receivable_id = r.id;

comment on view receivable_payment_state is
  '應收應付派生未結狀態。取代 web/lib/receivables-query.ts 的手算邏輯——
   之後該檔案應改為對這個 view 下 select,不再自己 reduce 加總。overpaid=true
   時 UI 必須顯示錯誤,不可吞掉(v3 spec 驗收項 A5)。';

-- === 驗證查詢 ===
-- select * from receivable_payment_state where status = 'open' order by remaining_twd desc;
-- select * from receivable_payment_state where overpaid;  -- 現況應為 0 筆,若非 0 表示既有資料已有超收超付未被發現
