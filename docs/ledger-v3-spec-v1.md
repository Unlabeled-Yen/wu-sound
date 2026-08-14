# 帳務 v3 規格 v1 — 財務系統翻修(2026-08-14)

狀態:**草案,待 Yen 審閱**。動工前需過文末「授權關卡」。

定位:v2 是「深化」(加欄位、加報表),v3 是「翻修」——改 UI 邏輯、改使用者流程、補後續整理機制,並**退役 v1/v2 的分裂結構**。參考對象為 Odoo 17 `addons/account` 的四個機制(帳簿看板、單一狀態機、派生付款狀態、分析分攤),只抄概念不抄實作,不引入複式記帳。

---

## 為什麼(診斷摘要)

2026-08-14 對現況的完整評估,按層排列:

| 層 | 問題 | 證據 |
|---|---|---|
| 數字說謊 | 淨額不含手續費、無標示 | `ledger/page.tsx` `net = income - expense`,`fee_twd` 只另列一卡 |
| 數字說謊 | 專案「淨額」人力成本為 0、無標示 | `day_site_allocations` 無任何報表引用;v2 spec 第 151 行「金額欄明示待填月薪」未實作 |
| 結構分裂 | 收據流與帳目流是兩條沒接起來的河 | `import-batch` 把整月收據壓成每人一筆、不帶 site_id;明細在入帳瞬間消失 |
| 結構分裂 | 應收應付另立一表,比 Excel 多一步 | `receivables` 要先建「約定」才能掛;老闆心智模型是每筆收入自帶「已收/待收」 |
| 分類混亂 | 13 個 kind 混了業務性質/付款方式/對象身份三個維度 | `credit_card` 與 `vehicle` 不互斥,同類支出被拆進兩桶 |
| 入口錯誤 | 首頁是 1100px 流水帳表格,老闆要自己找出「有什麼事沒做」 | `/boss/ledger` 無待辦訊號;AI 低信心草稿沉在 `ai_draft` JSON 裡無人看見 |
| 日常摩擦 | 無搜尋、party 自由文字、手機不可用、UTC/本地時區不一致 | 逐項見 2026-08-14 評估對話 |

根因一句話:**系統以「表格」為中心,不是以「待辦」為中心;資料以「兩套狀態機」流動,中間有一道把明細壓扁的牆。**

---

## 設計原則(四條,全部來自已驗證的外部參照)

1. **帳簿看板是入口**(Odoo `account_journal_dashboard`):首頁是幾張卡,每張卡=一本帳簿,卡上直接印「待辦計數」,卡上有主要動作按鈕。表格是下鑽終點,不是起點。
2. **一套狀態機**(Odoo `account_move.state`):`draft → posted → (cancel)`。draft 隨便改;posted 不可改,要改只能作廢+重開(沿用現有 void 機制)。收據、AI 草稿、定期範本產物、手工輸入,全部是 draft entry,確認即 posted——`expenses` 與 `ledger_entries` 之間那道牆拆掉。
3. **付款狀態是算出來的**(Odoo `payment_state`):應收應付不是另一張表,是帳目上的派生欄位 `not_paid / partial / paid`,由結算關聯自動計算。`receivables` 表退役。
4. **案子歸屬支援分攤**(Odoo `analytic_distribution`):`site_id` 單外鍵升級為 JSON 分攤 `{siteA: 60, siteB: 40}`;`day_site_allocations` 補上金額口徑後進報表,專案損益的人力缺口關閉。

憲章不變:AI 永不直接入帳、缺就 loud、DB 算總數、殘差行恆等式、全動作進 audit_log。

---

## 目標架構

### 帳簿(journal)

固定五本,enum 不開放自訂(規模不需要):

| journal | 涵蓋 | 對應舊 kind |
|---|---|---|
| `customer` | 客戶收入、開發票、待收 | project, other_income |
| `vendor` | 廠商/營運支出、待付 | goods, vehicle, rent, utility, tax |
| `pettycash` | 員工代墊零用金(收據流入口) | reimbursement |
| `payroll` | 薪資獎金 | salary, bonus |
| `personal` | 老闆個人/業外 | loan, investment, health |

kind 保留為帳簿內的細分類,但 **`credit_card` 自 kind 退役**,改為獨立欄位 `payment_method`(`transfer / cash / credit_card / check`,可空)。

### 狀態機

```
ledger_entries.state: draft → posted → (voided)
ledger_entries.to_check: boolean   ← AI 低信心 / 人標記「當時不確定」
```

- `expenses` 表**保留**作為收據擷取層(照片、AI 抽取結果),但 `confirmed` 之後的動作從「等月結壓成一筆」改為「**逐筆生成 draft ledger entry**(帶 site 分攤、帶 receipt 連結)」。
- `import-batch` 聚合路徑退役(見清理章)。薪資結算 `book_batches` 鎖定機制保留,鎖定=該月相關 entries 全部 posted 且不可再改。
- AI 抽取 `confidence: 'low'` → 對應 draft entry 自動 `to_check = true`。

### 付款狀態(取代 receivables)

```
ledger_entries 追加:
  expected_twd integer      -- 約定總額(應收/應付單才填;一般帳目為 null)
  settles_entry_id uuid     -- 本筆是對某張應收/應付單的結算
payment_state(派生,不落庫或物化皆可):
  null(非應收付單)/ not_paid / partial / paid / overpaid(loud 顯錯)
```

一筆「斗六旌旗 應收 407,715」= 一筆 posted 收入 entry 帶 `expected_twd`;之後每筆入帳 entry 用 `settles_entry_id` 指向它。`remaining = expected - Σ(settling posted entries)`,DB view 計算。超收顯錯不吞——沿用現有 `receivables-query.ts` 的 overpaid 邏輯。

### 案子分攤

```
ledger_entries.site_distribution jsonb  -- {"<site_id>": 百分比, ...},Σ必須=100
```

- 單案=`{"<id>": 100}`;UI 預設單選,進階才展開多案分攤。
- `site_id` 欄位保留一個過渡期作唯讀鏡像(=分攤中占比最大者),報表全面改讀分攤後移除。
- 人力:`day_site_allocations × user_pay_profiles` 派生人力分攤(v2 spec 演算法 1-6 不變,**人力分攤絕不寫入 ledger_entries**)。月薪未填時,損益頁金額欄明示「待填月薪」——此條為 v2 未還之債,v3 列驗收必要條件。

### UI 流程

| 頁面 | 內容 |
|---|---|
| `/boss/ledger`(重做) | **看板首頁**:五張帳簿卡。每卡:待辦計數(草稿 N 筆/待確認 N 筆/待收付 $X/逾期 N 筆)+ 一顆主按鈕(記一筆/審核/對帳)。加一張跨簿「待確認 to_check」卡 |
| `/boss/ledger/[journal]` | 單帳簿明細:手機=卡片流、桌機=表格;頂部草稿確認區;搜尋(party/memo/金額) |
| `/boss/ledger/new` | 表單重排:先選帳簿 → 只出現該帳簿相關欄位(基本 4 欄:日期/金額/kind/對象;案子、發票、付款方式、手續費摺疊為進階) |
| `/boss/report` | 沿用 v2 報表中心,改讀 site_distribution;專案維度淨額標示口徑(未含人力→「粗毛利」;含人力→「估算毛利」) |
| 應收應付 | 不再有獨立管理頁;customer/vendor 帳簿卡直接列「未結清單」,每筆點開即掛結算 |

party 升級:維持 text 欄位,但輸入元件改 datalist 自動完成(來源=既有 party 去重 + `sites.customer_name`),不建 customers 表(規模化階段再議)。

時區:全站統一台北時間(`Asia/Taipei`)取「今天/本月」,消除 UTC/本地混用。

---

## 舊系統清理(退役清單)

原則:**先斷寫入,再遷資料,最後拆讀取**。每步可回滾,舊表退役前先驗證新舊數字相等。

### C1 · 資料遷移(migration 014,單一 transaction)

| 舊 | 遷往 | 規則 |
|---|---|---|
| `ledger_entries.status`(active/voided) | `state`(posted/voided) | 既有帳目全部視為 posted(它們都是老闆手輸已確認);voided 照搬 |
| `ledger_entries.kind='credit_card'` | `kind='other_expense'` + `payment_method='credit_card'` | 逐筆,原 kind 記入 audit_log diff |
| `ledger_entries.site_id` | `site_distribution={"<id>":100}` | site_id 欄過渡期保留唯讀 |
| `receivables`(open/closed) | 帶 `expected_twd` 的 posted entry | direction 對映;`memo` 前綴「應收單」;原 `receivable_id` 掛帳 → `settles_entry_id` |
| `receivables`(voided) | 不遷 | 匯出 CSV 存 `docs/migration-archive/` 後留表待刪 |
| 既有 import-batch 聚合筆 | **不動** | 歷史已鎖定月份維持原貌;僅記文檔說明「2026-08 之前零用金無明細」 |
| journal 欄位回填 | 依上表 kind→journal 對映 | 全筆數必須有 journal,NOT NULL 收尾 |

### C2 · 程式路徑退役

| 退役 | 替代 |
|---|---|
| `POST /api/ledger/import-batch`(壓扁聚合) | 收據 confirmed → 逐筆 draft entry;薪資鎖定改為批次 post |
| `/boss/ledger/receivables` 頁 + `receivables` CRUD API | 帳簿卡未結清單 |
| `ImportBatchDialog.tsx` | 移除 |
| `LedgerForm` 的 receivable 下拉 | 未結單詳情頁「記收款」按鈕(方向反轉:從單出發記錢,不是從錢出發找單) |
| kind 選單中的 `credit_card` | payment_method 欄位 |

### C3 · 表與欄位刪除(migration 016,C1/C2 上線滿一個月、驗證通過後)

- drop `receivables`(先 `pg_dump` 該表存檔)
- drop `ledger_entries.site_id`、`ledger_entries.receivable_id`
- `ledger_kind` enum 移除 `credit_card`(PostgreSQL 不支援 DROP VALUE:建新 enum → cast 遷移 → 換名,獨立 migration 單獨跑——記取 013 的 ALTER TYPE 教訓)

### C4 · 測試資料 wipe

正式啟用前 DB 內測試帳目全清(既有授權關卡,未解)。wipe 腳本連同驗證查詢一起交付:wipe 後 `select count(*) from ledger_entries` 等七張表全部歸零、`audit_log` 記一筆 wipe 事件。

---

## 分批交付

| 批 | 內容 | 擋不擋後批 |
|---|---|---|
| **批 0 · 止血**(不動結構,先還債) | 三處淨額口徑標示(未含人力/未扣手續費)、淨額改為扣手續費或標明、`ai_draft.confidence='low'` 在 expenses 清單亮 badge、時區統一 | 不擋 |
| **批 1 · 資料地基** | migration 014(state/to_check/journal/payment_method/expected/settles/site_distribution + 資料遷移)、migration 015(索引與 view)、新 API 寫入路徑 | 擋批 2/3 |
| **批 2 · 看板與流程** | 看板首頁、單帳簿頁(含手機卡片)、新表單、收據→draft entry 管線、應收付併入帳簿卡 | 擋批 3 |
| **批 3 · 清理收尾** | C2 全部退役、C3 刪表刪欄、C4 wipe(過授權)、報表改讀 site_distribution | — |

批 0 立刻可做。批 1 起每批都有獨立 DoD(見驗證章),上一批 DoD 不過不開下一批。

---

## 驗證方式

### V1 · 資料層不變量(每次 migration 後 + 每晚可重跑的 SQL 腳本,交付於 `supabase/checks/ledger-v3-invariants.sql`)

```
I1  金額守恆:遷移前後 Σamount_twd(按 direction×月)逐月相等
I2  筆數守恆:遷移前 active+voided 筆數 = 遷移後 posted+voided 筆數 + 應收單新增筆數(精確對帳,不是約等)
I3  journal 完備:journal is null 的筆數 = 0
I4  分攤恆等:site_distribution 非空者,jsonb 百分比 Σ=100(容差 0)
I5  結算不超收:每張應收付單 remaining ≥ 0;違反者 = overpaid,必須出現在 UI 錯誤區(允許存在、不允許沉默)
I6  殘差行恆等式:報表任一維度 Σ分項+未歸類 = 帳本總數(v2 既有,v3 續用)
I7  鎖定月不可變:posted 且屬已鎖定 batch 的 entry,updated_at 不得晚於鎖定時間(audit_log 交叉核對)
I8  收據可追溯:批 2 之後新增的 pettycash posted entry,100% 能 join 回 expenses 原始收據
```

任何 invariant 破 → 腳本 exit 非零、輸出違規列表。不設「警告」等級,全部是錯。

### V2 · migration 演練(交付前必做,不是選做)

依 [migration 必須實測] 慣例:014/015/016 各自在**真 postgres**(本機 `supabase db reset` 或 staging)完整跑過,且必須用**含代表性資料的副本**演練(至少:一筆 voided、一筆 credit_card、一張部分結清的 receivable、一筆 import-batch 聚合筆、一筆掛 site 的帳)。演練紀錄(指令+輸出)附在 PR。016 的 enum 重建單獨演練回滾。

### V3 · UI 驗收腳本(批 2 DoD,逐條人工或 Playwright 走)

```
A1  老闆開首頁 → 3 秒內能回答「今天有什麼帳務的事要做」(卡上計數可見,不需點入)
A2  記一筆常見支出(廠商、轉帳):從點「記一筆」到完成 ≤ 4 個必填欄位、≤ 30 秒
A3  拍收據 → AI 低信心 → 首頁「待確認」卡計數 +1 → 點入逐筆看 → 修正 → 確認 → 計數歸零
A4  建一張應收 407,715 → 記兩筆部分入帳 → 卡上待收金額正確遞減 → 結清後從未結清單消失
A5  記一筆多入帳超過 expected → UI 顯 overpaid 錯誤,不自動吞也不擋死
A6  手機(375px)完成 A2、A3 全程,無橫向捲動
A7  搜尋「旌旗」→ 跨月找到該 party 所有帳目
A8  專案報表:掛 60/40 分攤的支出,兩案各見其份額;人力金額未填月薪時顯示「待填月薪」字樣,不是 0
A9  月結鎖定後嘗試編輯該月 posted entry → 被擋且訊息明確
A10 淨額卡片標示口徑;手動驗算:淨額 = 收入 − 支出 − 手續費(或標明未扣)
```

### V4 · 平行對照期(批 2 上線後、批 3 動刀前,至少一個完整月結週期)

- 舊報表頁與新看板並存,同一組數字兩邊顯示;每週跑一次 diff 腳本,新舊合計不等即 loud。
- 老闆實際用新流程走完一次月結。**他走不完或繞回 Excel,批 3 不准動**——清理只能清「已被取代」的東西,不能清「還在用」的東西。

### V5 · 清理完成驗證(批 3 DoD)

```
D1  grep 全 codebase:receivable_id / import-batch / ImportBatchDialog 零引用(migration 檔與 archive 除外)
D2  舊路由 /boss/ledger/receivables 回 404 或 redirect
D3  `npm run build && npm test` 綠
D4  invariants I1-I8 全過
D5  receivables 表已 dump 存檔且 drop;schema.sql 同步反映
D6  docs/migration-archive/ 含:receivables dump、voided receivables CSV、演練紀錄
```

---

## 授權關卡

| 關卡 | 擋什麼 | 現況 |
|---|---|---|
| Yen 核可本 spec 方向(尤其 receivables 併掉、import-batch 退役) | 批 1 | 待審 |
| 內帳測試資料 wipe 授權 | C4 / 正式啟用 | 既有關卡,未解 |
| 每人月薪數字 | A8 的金額化(標示「待填月薪」不擋) | 既有關卡,未解 |
| Kimi 收據辨識正式上線 | 收據管線正式化(草稿流程不擋) | 既有關卡,未解 |
| 老闆過目五本帳簿的名字(用他的語言) | 批 2 看板文案 | 新增 |

## 明確不做

- 複式記帳、科目表、借貸平衡——規模不需要,v3 仍是單式流水帳+派生視圖
- customers 正規化表、多幣別、電子發票、銀行 CSV 對帳——維持規模化階段
- journal 開放自訂——五本固定,老闆真的長出第六本再說
- 從 Odoo 複製任何程式碼——LGPL-3,只取概念;本專案無 Python
- cron 定期任務——定期範本維持 lazy 產生(開頁補產),不引入排程靜默失敗面

## 未決事項(不擋批 0/1)

- 看板卡是否要迷你趨勢圖(Odoo 有):先不做,老闆提再說
- `to_check` 的解除是否要留 audit 理由:先只記 audit_log 動作,不強制填理由
- 平行對照期長度:預設一個月結週期,可依老闆使用狀況延長
