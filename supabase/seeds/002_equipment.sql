-- Phase 2 seed:雇主自報的大型設備清單。
-- 執行前提:schema.sql 或 002_add_equipment.sql 已跑過。
insert into equipment (name, brand, model_number, category, quantity, unit, status) values
  ('CODA HOPS8i(8寸主動式)', 'CODA', 'HOPS8i', 'speaker', 2, '顆', 'in_storage'),
  ('12寸主動式喇叭(型號待補)', null, null, 'speaker', 2, '顆', 'in_storage'),
  ('Soundcraft 類比控台', 'Soundcraft', null, 'mixer', 1, '台', 'in_storage'),
  ('Behringer X32 數位音控台', 'Behringer', 'X32', 'mixer', 2, '台', 'in_storage'),
  ('MA2 light 燈控台', 'MA', 'MA2 light', 'light_console', 1, '台', 'in_storage'),
  ('面燈', null, null, 'light', 2, '支', 'in_storage'),
  ('LED BAR', null, null, 'light', 8, '支', 'in_storage'),
  ('Wash', null, null, 'light', 2, '支', 'in_storage'),
  ('Blinder', null, null, 'light', 100, '支', 'in_storage'),
  ('煙機(含風扇)', null, null, 'light', 2, '台', 'in_storage'),
  ('移動式舞台 50×50', null, null, 'stage', 16, '座', 'in_storage'),
  ('無線麥克風(型號待補)', null, null, 'mic_wireless', 6, '支', 'in_storage'),
  ('投影機', null, null, 'projector', 1, '台', 'in_storage')
on conflict do nothing;
