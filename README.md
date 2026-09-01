# 聲生工作系統(wu-sound)

替一間音響工程公司做的微型 ERP:報價、帳務、設備、案場、聲學規劃收攏成一套,
上面再蓋一層語音 Agent——老闆跟員工用講的就能把事情記進系統。整套用 AI 開發。

> **關於這個 public repo**:程式碼、規格、架構決策公開。
> 訪談紀錄、評估文件、給老闆的簡報等公司內部文件保留在本機,不進 git。

## 快速一瞥

### 手機(PWA)—— 老闆與員工共用的入口

<p align="left">
  <img src="docs/screenshots/mobile-voice-agent.png" alt="語音 agent — 手機首頁,通話中" width="260">
  <img src="docs/screenshots/mobile-staff-home.png" alt="員工端 — 拍收據" width="260">
  <img src="docs/screenshots/mobile-login.png" alt="登入" width="260">
</p>

左:手機首頁就是語音 agent,打開直接講話。中:拍收據,拍完即存。右:PIN 登入,不裝 App。

### 老闆桌機 —— 聲學規劃

SPL 預算計算器與陣列設計器併成同一頁:上半用喇叭最大音壓反推可涵蓋的最遠距離,下半依覆蓋角與場地寬度推算喇叭數量、間距與實際覆蓋,兩邊共用同一組喇叭規格,改一邊另一邊立刻跟著算。

![聲學計算 — SPL 預算 + 陣列設計器](docs/screenshots/desktop-acoustic.png)

### 老闆桌機 —— 財務

帳務管理的「金流監測」:實收實付淨額(真的在帳戶裡的錢)與帳面淨額分開陳述,未來四週現金依約定收付日排入週次並標出安全水位,右欄是當月已收付明細與尚未收到的款項。

![帳務管理 — 金流監測](docs/screenshots/desktop-ledger.png)

> 桌機與登入頁以示範帳號截圖,無真實客戶/案場資料;財務畫面的案場、往來對象、金額全是本機產生的示範資料。
> 語音 agent 那張是真機實測,AI 回覆段落提到真實案場名稱,已遮蔽。

## 公司輪廓

- 業務線一「聲音工程」:初步瞭解客戶需求 → 聲學規劃/基礎聲學分析 → 報價 → 排程 → 施工
- 業務線二「租賃」:A. 純設備租賃(詢需求→報價配置→現場安裝);B. 同 A 但含 PA、燈光、舞台執行
- 規模:老闆 1 人 + 員工 3-5 人
- 老闆是唯一電腦使用者(報價、記帳、排程全是他);員工只用手機(打卡、零用金報備、工作記錄)
- 現行流程:口頭 + 人工填 Excel;客戶需求多為現場口頭詢問
- 改價權只在老闆,依案件規模 + 品項市場動態價,有歷史報價留存

## 設計憲章

1. **無靜默失效**:失敗要 loud,AI 只產草稿、每筆須人工確認才生效
2. **AI 隱形嵌入**:老闆對 AI 零認知,AI 藏在既有動作裡(語音/拍照 → 結構化資料),不要求任何人「學 AI」
3. **Deterministic 主軌 + LLM 副軌**:電學計算、帳務數字絕不由 LLM 產出
4. **比 Excel 少步驟**:任何流程若比現行 Excel 多兩步,老闆就會棄用

## 約束

- 預算:老闆只願付 API 費 → hosting 走免費層(Supabase + Vercel/Cloudflare 之類),AI 用 Claude API
- 無時程壓力
- 員工端不裝 App,用手機瀏覽器(PWA)

## 內容目標(每一塊要做到什麼)

### 員工端(手機 PWA)
三件套:打卡、零用金報備、專案備忘。**目標比 LINE 少步驟**,PIN 登入不裝 App。手機首頁已改成語音 agent(見下),打卡與拍收據收進左上角抽屜;拍完即存,AI 稍後自動辨識金額。

### 老闆端(桌機 + 手機)
把報價、記帳、聲學規劃、標案監測收攏成單一操作面板,AI 藏在動作裡:語音 → 需求單、拍照 → 收據、口述 → SPL 配置。**任何 AI 產出都是草稿,老闆按下確認才生效**。手機版首頁跟員工一樣是語音 agent——同一個 AI,入口不同而已。

### 語音 agent(手機首頁)
老闆與員工的手機首頁就是同一個語音 agent:打開就講話,不進任何選單。這是「AI 隱形嵌入」憲章最直接的落地——沒有人需要知道自己正在用 AI。

- **全雙工對答**:走 OpenAI Realtime API + WebRTC。瀏覽器拿到的是伺服器現鑄的 ephemeral token,真正的 API key 不下放到前端。
- **斷句交給模型**:用 `semantic_vad`,不再手調靜音毫秒數(threshold 0.5→0.82、silence 500→1300ms 全試過,都不如語意判斷)。
- **會自己掛斷**:agent 手上有 `end_call` 工具,講完再見就收線;閒置 15 秒也自動斷線,不會放著一直計費。
- **打字備援**:同一套工具鏈也接文字模式,Anthropic Claude 為主、Kimi 為備,桌機 ⌘K 全站呼叫。語音不通時照樣能用。
- **模型手上沒有寫入工具**:它只有 `propose_write`。伺服器回一枚 60 秒過期、綁 payload SHA-256 的 token,第二段才真的落庫,提議與寫入各記一筆 audit log。模型多塞或少塞一個欄位,雜湊就對不上。
- **只寫任務,不寫日誌**:AI 一律記成看板任務。曾發生「AI 判成工作記錄、人在任務看板上找不到、以為沒存成功」,索性把工作記錄整套移除。

> **一個有意識的讓步**:打字路徑仍要人按確認,語音路徑(2026-08-24 定案)拿掉口頭確認、講完直接寫入。兩段式 token、雜湊比對、audit log 全部保留,只是「誰按確認」從人換成系統——這是憲章第 1 條為了「比 Excel 少步驟」讓出的一步。

### 語音軌跡(error analysis)
每通對話的逐字稿、AI 回覆、每一次工具呼叫(含失敗原因)都寫進 `voice_traces`,老闆端 `/boss/voice-traces` 可按通次翻查。**只存文字,不存音檔**。這頁刻意做得陽春——它的用途是錯誤分析,不是給人看的報表。

### 聲學規劃工具
把老闆的口頭需求 →(NL 解析)→ 結構化參數 → SPL/陣列計算 → 可回饋修改的閉環。**電學計算走 deterministic,不交給 LLM**。
- **SPL 預算計算器**:用喇叭最大音壓反推可涵蓋的最遠距離,估算場地佈點用
- **陣列設計器**:給定場地寬度、觀眾席距離、覆蓋角,推薦陣列喇叭數量與間距(Auto Mode / Quantity / Unity / Spacing / Splay 五模式)

### 標案監測(tender-radar)
外部訊號(等標期壓縮、第幾次招標)自動收集,老闆端 zero-config 唯讀。

### 內外帳
最敏感一塊,規則:AI 只做 OCR/結構化草稿,金額必須人工核對。收據辨識雙 provider(Anthropic / Kimi vision),資料主權由老闆選擇。

## 進度

### ✅ Phase 1:員工手機三件套(已上線)
- PIN 登入、打卡、零用金報備、工作記錄
- PWA(manifest + iOS standalone,可加到主畫面當 App 用)
- 老闆手機 UI + 導覽效能改善(拿掉 layout 阻塞的 count query + 熱門路由 prefetch)

### ✅ Phase 2:設備庫存(已上線)
- 大型設備位置追蹤(庫房 / 案場 / 維修)

### ✅ Phase 3:報價系統(已上線)
- 報價單 + 品項庫 + AI 選設備入口
- 母版列印 + 全站暗色玻璃改版
- 價目表匯入 + 毛利 % 顯示
- 品項庫視窗鎖(避免誤改)

### 🟡 Phase 4:內外帳(進行中)
- ✅ 內帳結構化 + 月結零用金匯入
- ✅ 收據辨識雙 provider(Anthropic / Kimi vision)
- ✅ 收據辨識 prompt 強化:金額改成獨立第一步、零推理、常駐核對提醒
- 🟡 Kimi provider 的資料主權待老闆授權(收據照片是否可流出台灣)

### ✅ 聲學規劃工具(已上線)
- SPL 計算器與陣列設計器併成單頁 `/tools/acoustic`,舊的兩條路由保留純轉址,既有連結不失效
- 陣列求解五個模式(Auto / Quantity / Unity / Spacing / Splay)全部實作,共用同一張覆蓋圖
- 覆蓋圖可切 Grid / Lines / Coords / Angles / Coverage 五個圖層,另附量測尺
- 喇叭規格(最大音壓、靈敏度、覆蓋角)從品項庫帶入,沒建檔的品項會明講「尚未建檔,請手動輸入」而不是靜默給預設值

### ✅ 語音 agent(已上線)
- 員工/老闆手機首頁改成 AI 對答介面,取代原本的底部分頁列
- OpenAI Realtime 全雙工對答 + `end_call` 工具 + 閒置 15 秒自動掛斷
- 文字路徑雙 provider(Claude 主 / Kimi 備),桌機 ⌘K 全站呼叫
- 兩段式寫入契約(propose → 60 秒 token → commit)+ audit log
- 語音軌跡落庫,老闆端可翻查(只存文字)
- 🟡 工具層 ACL 尚未接上——目前沒有任何工具碰得到財務/標案資料,所以還沒有越權面,但這是已知的缺口

### ✅ 標案監測(tender-radar 老闆端)
- 讀取 tender-radar API 的唯讀新分類
- 標案卡片顯示每案訊號(等標期壓縮 / 第幾次招標)

### ✅ 管理與基建
- 使用者 / 案場 / 員工設定
- GitHub Actions:tsc + build
- 部署 SOP(見 [docs/deploy.md](docs/deploy.md))
- 7 篇架構決策紀錄(見 [docs/adr/](docs/adr/))

### ⏸ 後段候補:排程
訪談中從未被主動提及,不是現階段的痛點。若日後需要,掛在庫存 + 工作記錄之上即可。

## 目錄

- `web/` — Next.js app(老闆端 + 員工端 PWA)
- `voice-lab/` — 語音 agent 的分階段實驗規格(Lab 1~4:工具契約 → 文字 agent → 語音辨識/全雙工 → 手機入口)
- `supabase/` — schema migrations + edge functions
- `docs/` — 公開規格、ADR、UI conventions、聲學規劃與 Array Designer 設計文件、產品截圖
- `intake/` — 從公司收來的原始資料(Excel 實例、內外帳文件、歷史報價單…)。**不進 git 遠端、不外流**

## 架構決策紀錄

見 [docs/adr/](docs/adr/):

1. 收據金額推理優先(先識別金額、再推理其他欄位)
2. AI 永遠不設價格
3. AI provider 選擇是資料治理問題
4. 排程明確排除於範圍外
5. 打卡↔薪資結算走 Path A
6. Hosting 必須走免費層
7. PIN 認證給非技術員工

## Tech Stack

- Next.js (App Router) + TypeScript
- Supabase (Postgres + Auth + Storage + Edge Functions)
- Anthropic Claude API + Moonshot Kimi API(收據辨識雙軌、文字 agent 主備)
- OpenAI Realtime API(WebRTC 全雙工語音)+ gpt-4o-transcribe(語音辨識)
- Vitest
- 部署:Vercel / Cloudflare 免費層
