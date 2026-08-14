# wu-sound-fde 全平台考古 — 4/4:裁決清單

> 照交接文件模板第二階段。Yen 逐條標註後,下一輪由接手者(AI session 或工程師)
> 整理成權威規格書。裁決欄位填:
> **✅ 正確,保留** / **❌ 錯誤,正確規則是:___** / **🗑️ 不需要,刪除** / **❓ 不確定,需討論**
>
> 對應原始考古細節見 [platform-archaeology-3-debt.md](./platform-archaeology-3-debt.md)。
> 帳務模組的問題已於本輪修復,不列入裁決(見文末備註)。

---

## 全平台等級


| #   | 項目                                                                                                       | 裁決  | 備註/正確規則 |
| --- | -------------------------------------------------------------------------------------------------------- | --- | ------- |
| P1  | `schema.sql` 已過期,遺漏 6 個 migration 的內容(套組、品項規格、LINE 綁定、voice-lab 表、搜尋索引)。要不要花一輪把它補齊、往後每次 migration 都同步更新? | v   |         |


---

## 設備庫存


| #   | 項目                                                  | 裁決                   | 備註/正確規則 |
| --- | --------------------------------------------------- | -------------------- | ------- |
| E1  | 🔴 淘汰設備可以透過「移動」功能直接復活回在庫/在場,沒有任何攔阻或標記               | v                    |         |
| E2  | 🔴 設備狀態機沒有轉移限制(維修中可直接跳案場、任何狀態可跳回任何狀態)               | v                    |         |
| E3  | 🟡 「編輯基本資料」有兩套實作(server action + API route),行為已經不一致 | 請檢測不一致缺口 假設應用場景給我做裁決 |         |
| E4  | 🟡 「淘汰設備」邏輯複製貼上兩份                                   | v 留下可用的那份即可 確認風險     |         |
| E5  | 🟡 `GET /api/equipment` 對員工開放且不過濾已淘汰(目前無人呼叫,潛在債務)   | 不過綠已淘汰是什麼意思          |         |
| E6  | ⚪ `serial_number` 無 unique constraint,同序號可重複建檔      | 說明讓使用者了解問題           |         |
| E7  | ⚪ `quantity` 無法表達部分調度(10 支麥克風 3 支在場、7 支在庫這種情況)      | 說明讓使用者了解問題           |         |
| E8  | ⚪ `GET /api/equipment` 是死碼,repo 內無人呼叫               | 真死碼就踢除               |         |




## 報價系統


| #   | 項目                                                                | 裁決      | 備註/正確規則     |
| --- | ----------------------------------------------------------------- | ------- | ----------- |
| Q1  | 🔴 編輯報價單明細的「存回價目表」勾選框預設打勾,容易誤觸覆寫全域售價                              | v 請提案修正 |             |
| Q2  | 🟡 `quotes.site_id`(報價↔實際毛利對照用)建了欄位但完全沒接                          | v       | 接上          |
| Q3  | 🟡 品項庫 8 個聲學規格欄位只能被工具讀,沒有任何寫入介面                                   | v       | 有需要寫入什麼介面嗎？ |
| Q4  | 🟡 `/api/catalog` 沒有 `include_inactive` 參數,品項下架後查無介面能再看到          | v       | 應該建立可查看管理介面 |
| Q5  | 🟡 品項庫 UI 完全沒有上架/下架按鈕                                             | v       | 製作上下架功能     |
| Q6  | 🟡 已停用套組詳情頁沒有存取限制、沒有重新啟用按鈕                                        | v       | 說明讓使用者了解問題  |
| Q7  | ⚪ 「標記已送出」按鈕與狀態下拉是兩條並行路徑做同一件事                                      | 解決這問題   |             |
| Q8  | ⚪ `quotes.note`/`catalog_items.note` 有 DB/API 支援但 UI 無輸入框         | 解決      |             |
| Q9  | ⚪ CSV 匯出總額未套用稅率,跟列印頁/編輯頁對不上                                       | 把他對上    |             |
| Q10 | ❓ 報價單狀態(draft/sent/won/lost)目前可任意跳轉,要不要限制合法轉移(例如 won 不能跳回 draft)? | 好       |             |




## 專案管理與現場


| #   | 項目                                                          | 裁決  | 備註/正確規則         |
| --- | ----------------------------------------------------------- | --- | --------------- |
| S1  | 🔴 `day_site_allocations.hours` 從未寫入,但 UI 文案宣稱它是損益依據        | v   | 確保損益正確的計算 無靜默失效 |
| S2  | 🔴 打卡與工作記錄各自問一次「今天去了哪個案場」,兩邊互不核對                            | v   | 不需要問 也不需要核對     |
| S3  | 🟡 worklogs / clockins 都沒有編輯或刪除入口                           | v   | 創建一個            |
| S4  | 🟡 `/api/sites` 不回傳 category_id/customer_name,員工端看不到案場分類/客戶 | v   | 要可以看到           |
| S5  | 🟡 `day_site_allocations` 一天可多案場,但工時分配沒有輸入介面                | v   | 請提案             |
| S6  | 🟡 `worklogs.site_id` DB 層可為 NULL,只在 API 層強制必填,兩層不一致        | v   | 請說明解釋 不一致情形     |
| S7  | 🟡 補打卡沒有順序/配對防呆,可能靜默改變已核對過的工時                               | v   | 請提案防呆機制 防止靜默失誤  |
| S8  | ❓ worklogs 跟 day_site_allocations 本質上是不是該合併成一套「今天去哪個案場」的紀錄? | v   | 請說明這是什麼意思       |




## 使用者、權限、LINE、voice-lab


| #   | 項目                                                      | 裁決  | 備註/正確規則                   |
| --- | ------------------------------------------------------- | --- | ------------------------- |
| U1  | 🟡 權限判斷散落在 30+ 支 API route,各自內聯重複,無共用 helper/middleware | ❓ 先記錄起來,本輪不執行 | 現況:28 支 route 各自寫 `session.role !== 'boss'`(或反向 `=== 'boss'`)內聯判斷,行為目前一致(都是「非 boss 就 403」),尚未發現實際權限漏洞,純粹是重複程式碼、沒有共用 helper。清單(git grep `role !== 'boss'` / `role === 'boss'`):api/boss/clockins/export.csv、api/boss/close-batches、api/boss/close/[month]/export.csv、api/boss/close、api/boss/pending-count、api/bundles/[id]/lines、api/bundles/[id]、api/bundles、api/catalog/[id]、api/catalog、api/clockins/[id]、api/clockins、api/day-site-allocations、api/equipment/[id]/move、api/equipment/[id]、api/equipment、api/ledger/[id]、api/ledger/[id]/void、api/ledger/external.csv、api/ledger/import-batch、api/ledger、api/quotes/[id]/export.csv、api/quotes/[id]/lines、api/quotes/[id]、api/quotes/[id]/suggest、api/quotes、api/receivables/[id]/status、api/receivables、api/worklogs。若未來要收斂,建議做法是一個 `requireBoss(session)` / `requireRole()` helper 取代逐支內聯判斷,純重構、不改變行為,可安全排入未來某輪。 |
| U2  | 🟡 Session 內嵌 role 且 14 天不查 DB,停用員工後對方舊 session 可能仍有效   | v   | 解決這個問題                    |
| U3  | 🟡 voice-lab-chat 沒有角色/案場區分,任何登入者可對所有案場下指令              | v   | 得有區分，誰登入誰寫入紀錄 都要紀錄標示是誰寫入的 |
| U4  | ⚪ `LineMessage` type union 型別定義冗餘                       | v   | 確定零風險冗餘就刪吧                |




## 標案監測


| #   | 項目                                        | 裁決  | 備註/正確規則 |
| --- | ----------------------------------------- | --- | ------- |
| T1  | ⚪ 三個頁面各自重寫環境變數檢查與錯誤訊息,無共用抽象層              | ☐   | 什麼意思    |
| T2  | ⚪ `/boss/tenders/agencies` 是孤兒路由,沒進任何導覽選單 | ☐   | 什麼意思    |


---



## 帳務模組(不需裁決,已修復)

本輪對話已經處理掉的問題(作廢未同步 state、actions.ts 死碼、總覽淨額口徑、
摘要卡不跟篩選)不列入這份裁決清單。未修復但刻意暫緩的三項(收據→分錄管線、
定期帳範本、人力成本未進損益)已記錄在
[ledger-master-spec.md](./ledger-master-spec.md) 第 5 節,狀態是「已知且已記錄
的缺口」,不是新發現,若你想連同這輪一起裁決,告訴我就把它們也搬進這份清單。

---



## 填寫方式

直接編輯這份檔案,把每一列的 `☐` 換成 `✅`/`❌`/`🗑️`/`❓`,❌ 的話在備註欄
寫正確規則是什麼。填完整份或填一部分都可以拿回來,我會依照已填的部分先動,
沒填的維持現狀等你有空再看。