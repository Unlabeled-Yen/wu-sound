# wu-sound-fde 進度總表(2026-08-11)

單一真相來源:本檔記錄「什麼做完了 / 什麼還沒」。規格細節見各 spec,待決策事項見 [open-questions.md](open-questions.md)。

---

## ✅ 已完成(已上正式站 https://wu-sound-fde.vercel.app)

### 基礎四階段
- **Phase 1 員工手機三件套**:打卡(含補打卡)、零用金拍收據 + Kimi vision OCR、工作記錄(一句話+前後照)
- **Phase 2 設備庫存**:13 件 seed、狀態機(庫房/專案中/維修中/淘汰)、移動 + movements 稽核 + timeline
- **Phase 3 報價系統**:報價單 CRUD、AI 選設備(只選品項絕不出價)、114 品項價目表
- **Phase 4 帳務**:內帳/外帳、月視圖、5% 稅額、薪資結算(月結 snapshot + 鎖定)、一鍵匯入零用金、CSV 匯出

### UI / UX
- 全站暗色玻璃改版(照片襯底+顆粒+毛玻璃,handoff 三份 mockup 全落地)
- 老闆桌面殼 + 老闆手機殼(5-tab bar)+ 員工手機殼,responsive 自動切換
- 價目表鎖視窗 + 分類左右滑動分頁
- PWA(manifest + iOS 加到主畫面)
- 導覽效能:layout 阻塞 query 移除、熱門路由 prefetch、loading 骨架、收據縮圖批次簽名(N+1 修掉)

### 報價深化
- 報價單母版化:器材/安裝分區、可調稅率、修正母版 Total 公式、專用列印頁(白底 A4 + logo + 制式條款)
- 缺價 loud 四層防禦(prompt 剝價 / schema 擋 / DB 查價 / UI+API 擋送出)
- 毛利% 顯示(2026-08-02)
- 標配套組 bundle 系統(CRUD + 從 bundle materialize 新報價,價格即時快照)

### 聲學規劃(四步中的第一步 + 工具)
- SPL 預算計算器 + 陣列設計器上線(deterministic 引擎)、桌機導覽 + 老闆側欄常駐
- 四步規格書全部寫完(step1 導覽 / step2 人話轉參數 / step3 器材聲學規格建檔 / step4 AI↔計算器閉環)

### 標案
- 標案監測頁(讀 tender-radar API、唯讀、含等標期壓縮/第幾次招標訊號)

### 治理 / 文件
- 7 篇 ADR(收據金額推理優先、AI 絕不出價、AI 供應商=資料治理、排程明確排除、打卡薪資只走 A 路、免費 hosting、PIN auth)
- 收據辨識 prompt 重設計(金額獨立第一步零推理)
- git history 敏感檔清除事件結案 + gitignore 防護 + README public 化準備
- 命名全站對齊老闆用語:價目表/專案/設備庫存/薪資結算/帳務管理/零用金管理/標配套組/案件管理

### 資料
- 價目進價表首次匯入(2026-08-02):57/114 品項進價售價補齊;QLXD24 合併;10 個對不上的品項記錄待確認

---

## 🚧 規格已寫、未動工

| 項目 | 狀態 | 卡在哪 |
|---|---|---|
| 聲學規劃 step 2(人話→參數,AI 只填輸入) | spec 完成 | 排程 |
| 聲學規劃 step 3(器材聲學規格建檔) | spec 完成;migrations 007/008 在 repo | **要先確認 007/008 是否已套進 Supabase**;未套的話「選喇叭帶入規格」是活的靜默失效 |
| 聲學規劃 step 4(AI 選設備↔計算器閉環驗證) | spec 完成 | 依賴 step 3 |
| LINE bot(推播+雙向,Bot 名「聲生製作」) | 方向定案 | 等 Yen/老闆到 developers.line.biz 建 channel,拿 Channel Secret / Access Token / Bot ID |
| 打卡↔薪資結算聯動(A 路:工時聚合+老闆手填薪水) | 方向定案 | 3 題待答:工時配對法 / 打卡不全怎麼擋 / 鎖定強度(見 open-questions.md) |
| 派工系統 tasks(多人指派+日期時段+Realtime) | **併入 voice-lab Lab 1**(最小版:單人+日期,無 Realtime) | 見下方 voice-lab 區塊 |
| **voice-lab**(現場語音/打字紀錄介面,`voice-lab/`) | Lab 0 契約 ✅、**Lab 1 後端轉接層程式碼已交付** | 待 Yen 套 migration 009 + 手動驗收,見 [voice-lab/README.md](../voice-lab/README.md) |

## 💡 討論過、完全未開工(AI 報價 flywheel)

1. 歷史報價 context injection(top-K 相似案入 prompt)
2. Bundle 交叉推薦(AI 先判斷最像哪個 bundle 起手)
3. Diff/reason 記錄(老闆改 AI 稿的理由 → 訓練訊號)
4. customers 表(現在 client_name 純字串,同客戶歷史撈不回)
5. 場地公式 sanity check(依賴 step 3/4)

另有 **agentic 路線圖**(2026-08-11 討論):四層信任漸進(觀察者→草稿代理→授權執行→永久禁區),第一層晨報 agent 與 LINE bot 是同一條工程。尚未寫成正式 roadmap 文件。

## ⏸ 卡在人(雇主/Yen),不在系統

- 喇叭瓦數×場地公式(雇主一直沒補;step 3/4 需要)
- 內帳正式資料授權(DB 有測試資料,正式啟用前要 wipe)
- Kimi 收據辨識正式上線授權(收據照可否流向中國供應商)
- 老闆薪資結構(B 路完整薪資自動化才需要)
- 剩餘 57 個品項進價/售價(等雇主補價目表再匯入)
- 10 個對不上的品項(YAMAHA CBR10/DXR10 MKlll/DSX12 MKIII/DM3S/DM3、MiPRO 626-600H/525-52H/323-32H、behringer X32 Compact、SHURE SLXD14)待雇主確認
- 標配套組實際內容(表建好了,老闆還沒列他的 5-10 組標配)

## 🐛 已知技術債 / 需驗證

- **SPL 計算器「選喇叭帶入規格」疑似無作用**(四層斷:DB 欄位不存在/migration 未套/型別選用/select(*) 不噴錯)——修復第一步是確認 007/008 是否已套進 Supabase
- 員工拍照失敗 localStorage 離線佇列:憲章有要求,實作是否存在未驗證
