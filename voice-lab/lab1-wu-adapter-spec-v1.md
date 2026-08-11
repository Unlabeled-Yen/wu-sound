# Lab 1 規格 v1 — 契約 × wu 後端轉接層(A 路)

**日期**:2026-08-11
**狀態**:規格定稿,待 Yen 指示後動工
**前置**:[契約 v1.0](contract/tool-contract-v1.md) 已凍結;A 路已拍板(接 wu 既有資料層,不接外部 PM 系統)

A 路定案後,原 Lab 1 的「mock 工具面」降級為可選——契約測試直接打 wu 轉接層,轉接層就是真實作。

---

## 1. 範圍

### 做
- 新增 migration `009_voice_tasks_proposals.sql`:兩張新表(`tasks`、`write_proposals`)
- 新增 6 個轉接端點:`web/app/api/voice/tools/[tool]/route.ts`(單一動態路由分派)
- 契約測試(voice-lab/contract/tests,12 條)對本地 dev 全綠
- 轉接層專屬的補充測試(§7)

### 不做(明確排除)
- 不動任何既有表(sites / worklogs / users / audit_log 零改動)
- 不動任何既有 API
- 不做前端介面(那是 Lab 2)
- 不做語音(Lab 3/4)
- 不做修改/刪除工具(契約層面就不存在)

---

## 2. 詞彙映射(契約 → wu)

| 契約詞 | wu 實體 | 映射細節 |
|---|---|---|
| project | **sites(專案)** | 契約的 `status` = `active ? "active" : "inactive"`;`client_name` 一律回 `null`(wu 的 sites 不記客戶名,契約形狀不變、值誠實為空) |
| task | **tasks(新表)** | 之前擱置的派工系統的最小版,本次順帶建立 |
| note | **worklogs(既有)** | `log_note` 寫進 worklogs;`tags` 附加到 note 文字尾端(` #標籤` 形式,不改 schema);`logged_on` 取 Asia/Taipei 當日 |

**已知誠實缺口**:搜尋只能比對案場名(無客戶名/地址可比);`client_name: null` 已知會讓「王太太的案子」這類口語搜尋落空——Phase 1 接受,記入 open-questions 待未來 sites 擴欄。

---

## 3. 新表 schema(migration 009,寫檔不執行,依慣例由 Yen 手動貼 SQL Editor)

```sql
-- 語音/打字介面:任務(派工最小版)+ 兩階段寫入提案

create table tasks (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id),
  title text not null,
  description text,
  due_date date,
  status text not null default 'open' check (status in ('open', 'done')),
  created_by uuid not null references users(id),
  source text not null default 'web' check (source in ('voice', 'text', 'web')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_site_status_idx on tasks (site_id, status, due_date);

create trigger tasks_bump_updated
before update on tasks for each row execute function bump_updated_at();

-- 兩階段寫入的提案/token。存 DB 而非記憶體:Vercel serverless 不保證同一實例,
-- 記憶體 token 會隨函式回收蒸發 → 確認流程隨機失敗,違反可靠性要求。
create table write_proposals (
  token uuid primary key default gen_random_uuid(),
  action text not null check (action in ('create_task', 'log_note')),
  payload jsonb not null,
  payload_hash text not null,          -- canonical JSON 的 SHA-256
  actor_id uuid not null references users(id),
  source text not null check (source in ('voice', 'text')),
  transcript_ref text,
  capture_ref text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,     -- created_at + 60s
  used_at timestamptz,                 -- 已消費時間;非 null = 不可再用於新寫入
  result jsonb                         -- 成功寫入的回傳(冪等重試直接回這個)
);

create index write_proposals_expiry_idx on write_proposals (expires_at);

alter table tasks enable row level security;
alter table write_proposals enable row level security;
```

設計說明:
- **token 落 DB 是硬需求**,不是選項(理由見註解)。`used_at + result` 同時解掉單次使用與冪等重試——同 token 重打,`used_at` 非空且 `payload_hash` 相符 → 直接回 `result`,不重複寫入。
- `tasks.source` 讓派工單分得出來自語音/打字/網頁,未來 boss 端 UI 可篩。

---

## 4. 認證與 actor

- 端點只認 `Authorization: Bearer ${VOICE_API_KEY}`(新環境變數);無效一律 401。
- Phase 1 單一使用者:寫入的 `actor_id` 取自環境變數 `VOICE_ACTOR_USER_ID`(指向 users 表某真實員工/老闆)。多使用者綁定是 Phase 2,欄位已預留。
- 既有的 session/PIN 體系完全不動——語音服務是獨立客戶端,不共用 cookie。

## 5. 端點行為(對契約的 wu 落地)

路由:`web/app/api/voice/tools/[tool]/route.ts`,POST only,所有回應帶 `X-Contract-Version: 1.0`。

| 工具 | 行為 |
|---|---|
| `search_projects` | `sites` 中 `active=true` 的 `name ilike %query%`;排序:前綴命中 > 包含命中;上限 5 |
| `get_project_summary` | site 名稱/狀態 + `tasks` 未完成數 + 最近 3 筆 worklogs(`logged_on` + note 截 60 字) |
| `list_tasks` | 該 site 的 tasks,status 篩選(預設 open),依 due_date 升冪,≤10 筆 + total |
| `propose_write` | 驗 payload 形狀 + site 存在 → 建 write_proposals 一筆 → 回 token + canonical_echo(due_date 展開為絕對日期)+ 60s;同時落 audit(`action: 'voice.propose'`) |
| `create_task` | 驗 token(存在/未逾時/未用/hash 相符)→ 寫 tasks → 回填 proposal.used_at+result → audit(`voice.create_task`) |
| `log_note` | 同上,寫 worklogs(note = content + tags hashtag 尾綴)→ audit(`voice.log_note`) |

錯誤碼照契約 §1:`TOKEN_REQUIRED / TOKEN_INVALID / TOKEN_PAYLOAD_MISMATCH / PROJECT_NOT_FOUND`,全帶可唸的 `message_zh`。

## 6. 稽核落點

沿用既有 `audit_log` 表,零改動:

```
actor_id     = VOICE_ACTOR_USER_ID
action       = 'voice.propose' | 'voice.create_task' | 'voice.log_note'
target_table = 'write_proposals' | 'tasks' | 'worklogs'
target_id    = 對應 id
diff         = { params, source, transcript_ref, capture_ref, proposal_token }
```

契約 §4 要求的欄位全部收進 `diff` jsonb,不需要動 audit_log schema。驗收「從紀錄回溯到轉寫文字」= 查 `diff->transcript_ref`。

## 7. 驗證計畫(三層)

### 7a. 契約測試(既有 12 條,不改一字)
```bash
cd voice-lab/contract/tests && BASE_URL=http://localhost:3777/api/voice API_KEY=$VOICE_API_KEY npm test
```
全綠 = 契約達成。這是主驗收。

### 7b. 轉接層補充測試(新增,約 8 條)
| # | 驗什麼 | 為什麼契約測試蓋不到 |
|---|---|---|
| 1 | `log_note` 後 worklogs 真的多一筆、note 含 hashtag 尾綴 | 契約只驗回傳形狀,不驗落庫 |
| 2 | `create_task` 後 tasks 多一筆且 `source='voice'` | 同上 |
| 3 | 冪等重試後 tasks/worklogs **筆數不變**(DB 層驗證,不只回傳相同) | 契約只驗回傳 id 相同 |
| 4 | token 逾時(注入短 TTL)→ `TOKEN_INVALID` | 契約測試不等 60 秒 |
| 5 | 每次 propose + 每次寫入,audit_log 各多一筆且 diff 完整 | 契約無法讀 wu 的 audit 表 |
| 6 | `search_projects` 不回 inactive 的 site | wu 專屬語意 |
| 7 | 既有 API 零迴歸:`npm run build` 過 + 抽查 3 個舊端點行為不變 | 轉接層不得外溢 |
| 8 | 無 `VOICE_API_KEY` 環境變數時,端點一律 503 帶明確訊息(不靜默放行) | 缺配置要 loud |

### 7c. 手動驗收(Yen 或老闆,5 分鐘)
1. 本地以 curl 或 REST client 走一遍:搜「磐頂」→ propose 一筆 note →(假裝口頭確認)→ commit → 到 `/boss/worklogs` 頁面**親眼看到**那筆紀錄
2. 在 Supabase 後台看 audit_log 三筆(propose + commit + 既有 worklog 建立慣例)可回溯

## 8. 風險與緩解

| 風險 | 緩解 |
|---|---|
| migration 009 忘了套(007/008 有前科) | 端點啟動時偵測表不存在 → 回 503「voice 資料表尚未建立」,loud 不裝死;progress.md 記一條 |
| `VOICE_ACTOR_USER_ID` 指到已停用使用者 | propose 時驗 users.active,否則 503 |
| 逾期 proposals 堆積 | 量極小(單使用者),Phase 1 不清;若要清,一條 SQL 手動跑,不建 cron |

## 9. 交付定義(Definition of Done)

- [ ] migration 009 檔案進 repo(執行由 Yen 手動)
- [ ] 6 端點實作完成,`tsc --noEmit` + `npm run build` 乾淨
- [ ] 7a 契約測試 12/12 綠(對本地 dev)
- [ ] 7b 補充測試 8/8 綠
- [ ] 7c 手動腳本寫在本文件附錄,Yen 可照做
- [ ] progress.md 更新(voice-lab Lab 1 完成 + migration 待套提醒)
- [ ] 全程零改動既有表與既有 API(git diff 可稽)
