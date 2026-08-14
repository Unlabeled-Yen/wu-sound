-- 帳務 v3 批1(資料地基,第一步):對應 docs/ledger-v3-spec-v1.md。
-- 原則:本檔只「新增」,不刪除任何既有表/欄位/enum 值 —— 對照 spec C1「先斷寫入、
-- 再遷資料、最後拆讀取」,刪除留給日後的 016(且 enum 刪值要獨立成一個 migration 執行,
-- 見 013 開頭的教訓:ALTER TYPE 與其他 DDL 混在同一個 transaction 會出相容性問題)。
--
-- ⚠️ 尚未在真 postgres 環境跑過。依專案慣例(見 feedback-migration-must-run-on-postgres),
-- 套用前必須先在本機/staging 用含代表性資料的副本演練一次,至少含:
--   一筆 voided、一筆 kind='credit_card'、一筆掛 site_id 的帳、一筆無 site_id 的帳。
-- 演練後若語法或資料遷移邏輯需要調整,直接改本檔重新演練,不要疊加修補 migration。
--
-- 本檔涵蓋:state/to_check/journal/payment_method 四個新欄位 + site_distribution。
--
-- 修正說明(實作中發現,已回寫 docs/ledger-v3-spec-v1.md 修正記錄):spec 草案原本打算把
-- receivables(應收應付「約定」)併成 ledger_entries 上帶 expected_twd 的 posted 分錄。
-- 這樣做會讓「應收 407,715」這種約定金額被現有收入/支出加總邏輯(income += amount_twd)
-- 誤當成真實現金流入算進當月收入,等實際收到錢時又被算一次——雙重計入,污染現金制報表。
-- 改為:receivables 表保留,不併入 ledger_entries;只在 015 把「未結金額怎麼算」搬進
-- DB view(對齊「DB 算總數」憲章),UI 呈現方式改成掛在帳簿卡而非獨立頁面。
-- expected_twd/settles_entry_id 兩欄因此不建立。

begin;

create type ledger_journal as enum ('customer', 'vendor', 'pettycash', 'payroll', 'personal');
create type ledger_payment_method as enum ('transfer', 'cash', 'credit_card', 'check');
create type ledger_state as enum ('draft', 'posted', 'voided');

alter table ledger_entries
  add column state ledger_state not null default 'posted',
  add column to_check boolean not null default false,
  add column journal ledger_journal,
  add column payment_method ledger_payment_method,
  add column site_distribution jsonb;

-- === 資料遷移一:status → state ===
-- 既有帳目全部視為 posted(它們都是老闆手輸已確認,沒有草稿的概念);voided 照搬。
update ledger_entries set state = case when status = 'voided' then 'voided'::ledger_state else 'posted'::ledger_state end;

-- === 資料遷移二:kind='credit_card' 拆成 kind + payment_method ===
-- credit_card 原本混了「付款方式」與「業務性質」兩個維度(見 v3 spec 診斷)。
-- 拆分後原本的業務性質資訊已遺失(schema 從未記錄"用信用卡買的到底是油錢還是租金"),
-- 保守處理:改標 other_expense,並用 to_check=true 讓老闆回去逐筆確認正確類別/帳簿——
-- 不用系統猜,猜錯比留白更糟(缺就 loud 憲章)。原始 kind 值寫入 audit_log 供對照。
insert into audit_log (actor_id, action, target_table, target_id, diff)
select created_by, 'migration.014.kind_credit_card_reclass', 'ledger_entries', id::text,
       jsonb_build_object(
         'before', jsonb_build_object('kind', 'credit_card'),
         'after', jsonb_build_object('kind', 'other_expense', 'payment_method', 'credit_card', 'to_check', true)
       )
from ledger_entries
where kind = 'credit_card';

update ledger_entries
set payment_method = 'credit_card'::ledger_payment_method,
    to_check = true,
    kind = 'other_expense'
where kind = 'credit_card';

-- === 資料遷移三:kind → journal(帳簿)===
update ledger_entries
set journal = case
  when kind in ('project', 'other_income') then 'customer'::ledger_journal
  when kind in ('goods', 'vehicle', 'rent', 'utility', 'tax', 'other_expense') then 'vendor'::ledger_journal
  when kind = 'reimbursement' then 'pettycash'::ledger_journal
  when kind in ('salary', 'bonus') then 'payroll'::ledger_journal
  when kind in ('loan', 'investment', 'health') then 'personal'::ledger_journal
end
where journal is null;

-- 理論上上面五組 when 窮舉了 ledger_kind 除 credit_card(已於遷移二消滅)外的所有值。
-- 若這裡還有漏網之魚,寧可讓 NOT NULL 在下一步炸開,也不要留一筆沒有帳簿的帳目。
alter table ledger_entries alter column journal set not null;

-- === 資料遷移四:site_id → site_distribution(單案 100%)===
update ledger_entries
set site_distribution = jsonb_build_object(site_id::text, 100)
where site_id is not null and site_distribution is null;

commit;

-- === 索引 ===
create index ledger_state_idx on ledger_entries (state);
create index ledger_journal_idx on ledger_entries (journal);
create index ledger_to_check_idx on ledger_entries (to_check) where to_check = true;

-- === 驗證查詢(套用後手動跑一次,確認遷移完整)===
-- select count(*) from ledger_entries where journal is null;              -- 應為 0
-- select count(*) from ledger_entries where kind = 'credit_card';         -- 應為 0
-- select count(*) from ledger_entries where site_id is not null and site_distribution is null; -- 應為 0
-- select state, count(*) from ledger_entries group by state;              -- 核對 posted/voided 筆數與遷移前 active/voided 相符
