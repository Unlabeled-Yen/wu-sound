-- 帳務 v3 不變量檢查。對應 docs/ledger-v3-spec-v1.md 驗證章 V1。
-- 可重跑,唯讀,不修改任何資料。用法:
--   psql "$DATABASE_URL" -f supabase/checks/ledger-v3-invariants.sql
-- 每條輸出 0 列 = 通過;有列印出來 = 違規,列出違規的那幾筆。
-- 不設「警告」等級——這裡列出來的東西全部是要修的,不是「之後再看」。
--
-- 現況說明:I6(殘差行恆等式)、I7(鎖定月不可變細節)、I8(收據可追溯)依賴批 2
-- 才會落地的資料流(帳簿卡、收據→draft entry 管線),批 1 階段這三條先留查詢骨架、
-- 註記「批 2 上線後才有意義」,不是「檢查永遠通過」的假象。

\echo '=== I1: journal 完備(不應有任何一筆缺帳簿)==='
select id, occurred_on, kind, direction, amount_twd
from ledger_entries
where journal is null;

\echo '=== I2: kind=credit_card 已退場(遷移 014 之後不應再出現)==='
select id, occurred_on, kind, payment_method
from ledger_entries
where kind = 'credit_card';

\echo '=== I3: site_id 與 site_distribution 一致(掛了案場就該有分攤)==='
select id, occurred_on, site_id, site_distribution
from ledger_entries
where site_id is not null and site_distribution is null;

\echo '=== I4: 分攤恆等式(site_distribution 非空時,Σ百分比必須 = 100)==='
select id, occurred_on, site_distribution,
       (select sum(value::numeric) from jsonb_each_text(site_distribution)) as total_pct
from ledger_entries
where site_distribution is not null
  and (select sum(value::numeric) from jsonb_each_text(site_distribution)) <> 100;

\echo '=== I5: 應收應付未超收超付(receivable_payment_state.overpaid)==='
\echo '    這條允許有結果(超收超付真實存在時本就該被看見),但不准沉默——'
\echo '    有列出來,代表 UI 的帳簿卡/未結清單必須顯示它,不可以吞掉。'
select id, direction, party, total_amount_twd, settled_twd, remaining_twd
from receivable_payment_state
where overpaid;

\echo '=== I2b: state 與 status 兩欄一致(void route 若漏同步,這裡會抓到)==='
select id, occurred_on, status, state
from ledger_entries
where (status = 'voided') <> (state = 'voided');

\echo '=== I9: to_check 待確認堆積量(非違規,純觀察——量太大代表 AI 抽取品質該檢討)==='
select count(*) as to_check_count
from ledger_entries
where to_check = true and state <> 'voided';

\echo '=== [批2後才有意義] I6: 殘差行恆等式,以本月為例 ==='
\echo '    Σ(依 site_id 分組的收入+支出) + 未歸類收入+支出 應等於本月營運帳目總額。'
\echo '    這條現在(批1)必然通過,因為報表分組邏輯本身就是靠這條寫的——真正的驗證'
\echo '    要等 site_distribution 取代 site_id 成為報表讀取來源後,對照兩種算法是否一致。'
with month_rows as (
  select * from ledger_entries
  where state <> 'voided'
    and occurred_on >= date_trunc('month', current_date)
    and occurred_on < date_trunc('month', current_date) + interval '1 month'
    and kind not in ('loan', 'investment', 'health')
)
select
  (select coalesce(sum(amount_twd), 0) from month_rows) as total,
  (select coalesce(sum(amount_twd), 0) from month_rows where site_id is not null)
    + (select coalesce(sum(amount_twd), 0) from month_rows where site_id is null) as grouped_total;

\echo '=== [批2後才有意義] I8: 收據可追溯(pettycash posted entry 應可 join 回 expenses)==='
\echo '    批 1 尚未實作收據→draft entry 管線(仍是 import-batch 整月壓成一筆),'
\echo '    這條現在必然回傳 0/0,不代表「通過」,是「還沒到檢查這個的時候」。'
select
  (select count(*) from ledger_entries where journal = 'pettycash' and state = 'posted' and source_batch_id is null) as pettycash_entries_without_batch,
  (select count(*) from expenses where status = 'confirmed') as confirmed_expenses;
