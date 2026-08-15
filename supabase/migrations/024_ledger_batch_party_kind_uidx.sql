-- 月結改版:每人每批次現在可能同時寫三種分錄(薪資/獎金/代墊),但既有的
-- ledger_batch_party_uidx 只鎖 (source_batch_id, party),沒有 kind——同一人在
-- 同一批次寫第二種分錄時會被這個唯一索引擋下,錯誤訊息又長得跟「重複匯入」
-- 一樣(duplicate/unique),寫入端會誤判成「已經匯過、正常跳過」而默默漏寫,
-- 是本輪要嚴防的靜默失效。
--
-- 原本的去重語意(同批次同人同 kind 不能重複匯入、作廢後才能重匯)沒有變,
-- 只是把 kind 加進唯一鍵——這才是實際要保護的不變量。
--
-- ⚠️ 尚未在真 postgres 環境跑過,套用前依專案慣例先在含代表性資料的副本演練。

drop index if exists ledger_batch_party_uidx;

create unique index ledger_batch_party_uidx
  on ledger_entries (source_batch_id, party, kind)
  where source_batch_id is not null and state <> 'voided';

comment on index ledger_batch_party_uidx is
  '同一批次(source_batch_id)、同一人(party)、同一種分錄(kind)只能有一筆還算數的
   (state<>voided)紀錄——防止重複匯入,但允許同一人在同一批次裡有薪資+獎金+代墊
   三筆不同 kind 的分錄共存(024 新增 kind 到唯一鍵,見月結改版)。';

-- === 驗證查詢 ===
-- select indexname, indexdef from pg_indexes where tablename = 'ledger_entries' and indexname = 'ledger_batch_party_uidx';
