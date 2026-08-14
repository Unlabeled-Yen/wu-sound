-- voice-lab Lab 2 實測發現:search_projects 原本用連續子字串比對(ilike '%query%'),
-- 對「跳字省略」的口語講法完全搜不到——例如講「磐頂教會」,真實案名是「磐頂長老教會」,
-- 中間夾了「長老」兩個字,四個字不連續出現在案名裡,比對直接落空。
-- 這在真實使用中會反覆發生(講話習慣性省略中間詞),不是邊角案例。
-- 此前被樣本資料(案名剛好含連續「磐頂教會」)意外蓋住,清掉樣本後才浮現。
--
-- Yen 已確認修法 A(2026-08-14):改用 pg_trgm 相似度比對,不要求連續子字串。
-- Lab 1 契約(search_projects 的請求/回應形狀)不變,只換內部比對演算法——
-- 這是 Lab 2 spec「不改 Lab 1 契約」原則下的授權例外,已明確記錄,不是靜默繞過。

create extension if not exists pg_trgm;

-- GIN 索引:sites 表會持續成長,相似度查詢不能全表掃描
create index if not exists sites_name_trgm_idx on sites using gin (name gin_trgm_ops);

-- search_projects 呼叫這個 RPC,不再直接 ilike。
-- 保留子字串比對當最高權重信號(舊行為的排序結果不倒退:原本搜得到的案子排名不變),
-- 再用 trigram 相似度接住跳字省略的情況。threshold 0.15 是保守值——
-- 中文短字串(4-8 字)的 trigram 相似度天生比英文單字低,0.3(pg_trgm 預設)太嚴會漏掉
-- 「磐頂教會」對「磐頂長老教會」這類案例。已知風險:threshold 訂太鬆會讓完全不相關的
-- 短案名互相命中,套用後需要用真實案名庫實測調整,不能只憑這裡的推算就當定案。
create or replace function search_sites_by_query(q text)
returns table (
  id uuid,
  name text,
  active boolean,
  is_substring_match boolean,
  match_score real
)
language sql
stable
as $$
  select
    s.id,
    s.name,
    s.active,
    (s.name ilike '%' || q || '%') as is_substring_match,
    greatest(
      similarity(s.name, q),
      case when s.name ilike '%' || q || '%' then 1.0 else 0.0 end
    ) as match_score
  from sites s
  where s.active = true
    and (
      s.name ilike '%' || q || '%'
      or similarity(s.name, q) > 0.15
    )
  order by
    (s.name ilike q || '%') desc,  -- 開頭吻合排最前,對齊原本的 prefix 排序邏輯
    match_score desc,
    s.name
  limit 20;
$$;
