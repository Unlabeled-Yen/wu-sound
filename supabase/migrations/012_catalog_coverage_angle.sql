-- 喇叭擴散角(dispersion),供陣列設計器從價目表帶入,不用每次手動查 datasheet。
-- 水平角是必要的(陣列設計器的「水平覆蓋角」就是靠它推算間距/splay);垂直角順手存,
-- 之後若要做垂直覆蓋估算可以用。兩欄皆可 null(缺值 loud 原則,UI 維持現有「請手動輸入」提示)。

alter table catalog_items
  add column coverage_h_deg numeric,
  add column coverage_v_deg numeric;

alter table catalog_items
  add constraint catalog_items_coverage_h_deg_check check (coverage_h_deg is null or (coverage_h_deg > 0 and coverage_h_deg <= 360)),
  add constraint catalog_items_coverage_v_deg_check check (coverage_v_deg is null or (coverage_v_deg > 0 and coverage_v_deg <= 360));
