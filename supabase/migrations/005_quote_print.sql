-- 報價單比照官方母版列印格式:分區(器材/安裝) + 可調稅率
alter table quote_lines
  add column section text not null default '器材' check (section in ('器材', '安裝'));

alter table quotes
  add column tax_rate numeric(4,3) not null default 0.05 check (tax_rate >= 0 and tax_rate <= 1);
