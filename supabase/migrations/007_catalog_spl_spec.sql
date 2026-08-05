-- 品項庫加喇叭 SPL 規格,供 SPL 預算計算器從價目表帶入。
-- 兩欄皆可 null(缺值 loud 原則,不強迫立刻補全),null 代表尚未建檔,計算器只能手動輸入。

alter table catalog_items
  add column max_spl_db numeric,              -- 規格最大音壓(dB SPL)
  add column spl_ref_distance_m numeric;       -- 上面數值的量測基準距離(公尺),規格通常標示 1m

alter table catalog_items
  add constraint catalog_items_max_spl_db_check check (max_spl_db is null or max_spl_db > 0),
  add constraint catalog_items_spl_ref_distance_m_check check (spl_ref_distance_m is null or spl_ref_distance_m > 0);
