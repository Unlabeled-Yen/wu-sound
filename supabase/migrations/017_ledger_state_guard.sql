-- 帳務系統止血(第0步):把「status/state 兩欄必須一致」從人工紀律升級成 DB 約束,
-- 修 receivable_payment_state 的粒度錯誤,修零用金入帳作廢後卡死的問題。
-- 背景:排查發現全庫只有 5 支程式會寫 ledger_entries,目前兩欄一致——但這個一致
-- 完全靠人記得同時寫兩欄維持,沒有任何資料庫層級保證。見 docs/platform-archaeology-3-debt.md
-- 與稽核紀錄(2026-08-15)。

-- === a. CHECK constraint 強制 status/state 同步 ===
-- 只鎖 voided 這個交集:status='voided' 若成立,state 必須也是 voided,反之亦然。
-- 不鎖 active/posted/draft 的對應,因為 status 只有 active/voided 兩態,天生無法
-- 表達 draft——一旦有 draft 分錄出現,status 只能是 active,這是型別本身的侷限,
-- 不是這條約束該管的範圍(那件事留給 C3 刪欄解決)。
alter table ledger_entries
  add constraint ledger_status_state_voided_sync check (
    (status = 'voided') = (state = 'voided')
  );

-- === b. receivable_payment_state 條件粒度錯誤:state <> 'voided' 應為 state = 'posted' ===
-- 原本的寫法會把未來可能出現的 state='draft' 分錄也算進「已結金額」,把應收未結
-- 洗低。目前系統沒有任何路徑會寫入 draft,所以現況無害,但這是未爆彈,先拆信管。
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
  where receivable_id is not null and state = 'posted'
  group by receivable_id
) settled on settled.receivable_id = r.id;

comment on view receivable_payment_state is
  '應收應付派生未結狀態。只認 state=posted 的分錄為「已結」——draft 尚未確認、
   voided 已作廢,兩者都不該算進已結金額。';

-- === d. 零用金入帳:作廢後卡死問題 ===
-- ledger_batch_party_uidx 原本涵蓋所有列(含已作廢),同一批同一人只要有一筆
-- (無論是否已作廢)就佔住位置,匯入時作廢重試會撞到這個舊列,永遠匯不回去。
-- 改成 partial index 只鎖「還算數」的列(state <> 'voided'),作廢後同批同人
-- 才能重新匯入。
drop index if exists ledger_batch_party_uidx;
create unique index ledger_batch_party_uidx
  on ledger_entries (source_batch_id, party)
  where source_batch_id is not null and state <> 'voided';

-- === 驗證查詢 ===
-- select conname from pg_constraint where conrelid = 'ledger_entries'::regclass and contype = 'c';
-- select indexname, indexdef from pg_indexes where tablename = 'ledger_entries' and indexname = 'ledger_batch_party_uidx';
-- insert into ledger_entries (...) 測試:同時給 status='voided', state='posted' 應該被 constraint 擋下
