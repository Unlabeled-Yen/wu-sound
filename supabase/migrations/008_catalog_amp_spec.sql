-- 擴大機匹配計算所需規格:喇叭靈敏度 + 擴大機額定功率。
-- 兩欄皆可 null,缺值時 UI 走手動輸入。
-- 阻抗匹配問題不建模——輸入的瓦數視為「實際負載下有效功率」,由使用者對規格負責。

alter table catalog_items
  add column sensitivity_db_1w1m numeric,   -- 喇叭靈敏度(dB @1W/1m)
  add column amp_power_w numeric;             -- 擴大機額定功率(W)

alter table catalog_items
  add constraint catalog_items_sensitivity_db_1w1m_check check (sensitivity_db_1w1m is null or sensitivity_db_1w1m > 0),
  add constraint catalog_items_amp_power_w_check check (amp_power_w is null or amp_power_w > 0);
