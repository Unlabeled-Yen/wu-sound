-- 報價系統改版(docs/handoff/03-quote-system):
--   1. 列表頁「已送出 N 天,未回覆」需要知道「這張單是什麼時候送出的」
--   2. 「近 90 天成交」計數卡需要知道「這張單是什麼時候成交的」
-- 但 quotes 表都沒有這兩個欄位——updated_at 會被任何編輯動作(改備註、調稅率…)
-- 污染,不能拿來當「送出/成交時間」用,那樣算出來的天數/篩選是假的,比不顯示還糟。
--
-- ⚠️ 尚未在真 postgres 環境跑過,套用前依專案慣例先在含代表性資料的副本演練。

alter table quotes
  add column sent_at timestamptz,
  add column won_at timestamptz;

comment on column quotes.sent_at is
  '狀態第一次轉為 sent 的時間點,由 API(app/api/quotes/[id]/route.ts PATCH)在轉移當下
   寫入,不是資料庫觸發器算的。已經有值就不再覆寫——狀態在 sent 之後被改回 draft
   又送出一次,沿用第一次送出的時間(避免使用者藉由來回切換洗掉「已經拖很久」的事實)。
   舊資料(此欄位加入前已是 sent/won/lost 的單)一律是 NULL,列表頁要顯示「已送出」
   但不能編天數。';

comment on column quotes.won_at is
  '狀態轉為 won 的時間點,由 API 在轉移當下寫入。won 是終態,理論上只會設定一次。
   舊資料一律是 NULL——「近 90 天成交」計數卡只能算有這個欄位的單,不能拿
   updated_at 頂替,否則舊資料會被誤判成剛成交。';
