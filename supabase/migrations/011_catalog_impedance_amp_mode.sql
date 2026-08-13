-- 補兩個欄位,修正 round1 audit 抓到的兩個誤判風險:
-- 1. 喇叭/超低音阻抗不同(CODA U-Sub 系列是 4Ω,不是常見的 8Ω)——擴大機匹配算功率時
--    抓錯阻抗檔會低估近 2 dB。
-- 2. 擴大機功率有 RMS(continuous)跟 burst(peak,通常 20ms)兩種量法,原廠常只公布其中一種
--    (YAMAHA PX3 只公布 burst),兩種數字不能直接跟別台的 RMS 比較,要標清楚量測基準。
-- 兩欄皆可 null(缺值 loud 原則,不強迫立刻補全)。

alter table catalog_items
  add column speaker_impedance_ohm numeric,
  add column amp_power_mode text;

alter table catalog_items
  add constraint catalog_items_speaker_impedance_ohm_check check (speaker_impedance_ohm is null or speaker_impedance_ohm > 0),
  add constraint catalog_items_amp_power_mode_check check (amp_power_mode is null or amp_power_mode in ('rms', 'burst'));
