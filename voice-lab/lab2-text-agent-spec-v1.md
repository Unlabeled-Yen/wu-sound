# Lab 2 規格 v1 — 文字模式 Agent(打字系統本體)

**日期**:2026-08-13
**狀態**:已確認(Anthropic only / 獨立頁面 / 記憶體存對話),動工中
**前置**:Lab 1 後端轉接層已完成(22/22 測試綠),6 個工具端點可用
**定位**:這不是測試工具,是「與 LLM 對話」的正式產品——語音(Lab 3/4)只是之後多接一種輸入方式,對話品質、狀態機、實體對齊全部在這一關把關做完善。

---

## 0. 長期願景與邊界(2026-08-13 補,Yen 確認方向)

**終局目標**:這個 agent 未來要嵌進整個 wu-sound 系統,對**全系統**有讀有寫,不只專案/任務/筆記。員工現場口述/打字 → LLM 整理成要點 → 放進系統對應區域管理。

**這不需要重做架構**——Lab 0 契約設計時就寫過「同一工具面未來可掛接文字介面、桌面 agent、其他客戶端」,擴張是「加新工具進同一個框架」,不是「換一套做法」。但長期願景裡「讀」跟「寫」的風險等級完全不同,擴張時必須守住既有憲章(ADR-0002 等),分三層:

| 類型 | 例子 | 開放程度 |
|---|---|---|
| **讀** | 查零用金月支出、客戶報價紀錄、設備維修狀態、庫存 | 幾乎全開——沒有不可逆後果,之後每個網域加幾個唯讀工具即可,跟現有 6 個工具同一框架 |
| **寫 · 現場記錄類** | 專案筆記、任務、工作記錄、**零用金草稿**(員工口述一筆油錢 → 建 draft,老闆仍要在系統按確認) | 可以持續擴大,但**一律**走 propose→confirm 兩階段 token,人工確認才落地 |
| **寫 · 財務終局動作** | 報價金額、零用金審核通過、內帳分錄、薪資結算鎖定、設價 | **永遠不做**——這些工具在契約層面根本不存在(跟現在「修改/刪除工具不存在」同一招),不是「AI 別亂用」的道德勸說,是型別/工具清單層級擋死。對齊 [ADR-0002](../docs/adr/0002-ai-never-sets-price.md):「AI 只選品項,絕不決定價格」 |

**Lab 2 現在的範圍不受此影響**——「專案筆記/任務」完全落在「現場記錄類」安全區,照 §1 做。這段只是把邊界寫下來,讓之後接手擴張的人(不管是我還是別的 session)不會不小心把寫入權限擴到不該碰的地方。

---

## 0.5 範圍調整(2026-08-14,Yen 指示)

### 把 agent 關進正軌

實測發現一個沒關上的出口:模型決定不呼叫工具時,它講什麼 runtime 都不管
(使用者問「貓跟狗你喜歡誰」,agent 陪聊還反問使用者是貓派狗派)。三層一起關:

1. `tool_choice` 強制 → 模型只能透過工具說話,不能直接回自由文字
2. 新增 `respond(text)` / `decline(reason)` → 拒絕文案由系統產生,模型只給分類
3. **respond 閘門(主力)**:這一輪沒呼叫過任何讀取工具就不准講。
   閒聊的共同特徵是不需要查任何資料,而合法回答一定查過東西——機械判準,
   不依賴語意理解也不依賴模型自律

### 民生 / 救難納入範圍

現場人員會問時間、天氣、有人受傷怎麼辦,這些不該被當成閒聊擋掉。做法**不是**放寬閘門,
而是給真的資料來源——原則沒鬆動(講的話要有事實來源),只是來源變多:

| 工具 | 資料來源 | 為什麼不讓模型自己答 |
|---|---|---|
| `get_now` | 伺服器時鐘(Asia/Taipei) | 模型算相對日期實測會錯 |
| `get_weather` | open-meteo(免 API key) | 模型沒有即時天氣,憑印象答就是說謊 |
| `emergency_info` | `lib/voice-agent-daily.ts` 寫死 | 急救步驟講錯會出人命;模型最擅長「聽起來有道理但細節錯」 |

救難那一輪的回覆由 runtime 強制加上「🚨 緊急狀況請先打 119」前綴,不靠模型記得講。
地名只認 22 縣市固定表,對不上就明講查不到——查錯地點卻回一個看起來正常的天氣是最糟的失敗方式。

**已知取捨**:打「你好」也會收到固定文案,沒有寒暄。現場工具是拿來記事情跟求救的。

---

## 1. 範圍

### 做
- **Agent runtime**:一個 server-side 對話迴圈,LLM 用 Anthropic tool-calling 呼叫 Lab 1 的 6 個工具(不是自己拼 JSON 猜格式,是原生 tool_use)
- **對話狀態機**:對齊原始 handoff spec §4.4,文字模式簡化超時規則(不需要 15 秒語音等待,但保留「未確認絕不寫入」鐵律)
- **實體對齊**:0/1/多筆三種情境的追問邏輯,禁止 LLM 憑記憶填 id
- **確認流程**:複述關鍵欄位 → propose_write 拿 token → 使用者明確肯定才 commit,模糊回應視為未確認
- **最小可用聊天 UI**:純文字對話框,给 Yen 驗證整條對話品質用(不是最終員工介面,那是 Lab 4 的事)
- **多輪對話記憶**:同一個對話 session 內,上一句「王太太的案子」講完後,下一句「再幫我記一筆」要記得指代同一個專案(handoff spec 沒明講,這是我們自己補的體驗優化)

### 不做(明確排除,避免範圍蔓延)
- 不做語音(STT/TTS,Lab 3/4 的事)
- 不做正式員工 UI(手機 PWA、離線佇列,Lab 4 的事)
- 不做多動作單輪拆解以外的複雜度(「幫我記 A 也記 B」按 handoff §8 拆成多輪逐一確認,不做批次)
- 不做新專案建立(handoff §4.3 明講不在 Phase 1)
- 不改 Lab 1 契約或轉接層一個字

---

## 2. Agent Runtime 設計

### 2.1 為什麼用原生 tool_use,不是 prompt 塞 JSON

wu 現有的 `lib/ai-quote.ts` 是「prompt 要求回 JSON、自己 regex 解析」的做法——這在報價那種單次生成場景夠用,但 Lab 2 是**多輪、需要 LLM 自主決定呼叫哪個工具**的場景,原生 tool_use 有三個好處直接對應到我們的鐵律:
1. **id 不會被憑空捏造**——tool_use 的參數是結構化欄位,LLM 沒辦法在自然語言裡「順便」夾帶一個假 id,只能在呼叫 `search_projects` 之後,用回傳的 id 去呼叫下一個工具
2. **工具呼叫是可稽核的事件**,不是要從自由文字裡二次解析出「它到底想幹嘛」
3. Claude 的 tool_use 原生支援多輪(呼叫工具 → 把結果餵回去 → 繼續推理),完全對應狀態機的 `processing → clarifying/confirming/responding` 轉移

### 2.2 工具定義(把 Lab 1 的 6 個 HTTP 端點包成 Anthropic tool schema)

```
search_projects(query: string)
get_project_summary(project_id: string)
list_tasks(project_id: string, status?: 'open'|'done'|'all')
propose_write(action: 'create_task'|'log_note', payload: object)
create_task(project_id, title, description?, due_date?, confirmation_token)
log_note(project_id, content, tags?, confirmation_token)
```

Agent 端只是把這 6 個 tool_use 呼叫轉發到 `POST /api/voice/tools/[tool]`(用 `VOICE_API_KEY`),回傳結果塞回對話歷史,不繞過契約、不直連 DB。

### 2.3 System Prompt 硬規則(對齊 handoff §4.3/§5,寫死不是建議)

```
1. 絕對不能自己編造 project_id 或 confirmation_token,一律用工具回傳的值。
2. 使用者要求「記一筆」或「新增任務」前,你必須先呼叫 search_projects 確認專案,
   模糊(0 筆或多筆)時要追問,不能自己選一個「看起來最像」的。
3. 寫入動作(create_task/log_note)前,你必須先呼叫 propose_write 拿到
   confirmation_token,並用口語複述關鍵欄位(專案全名、動作、內容摘要、日期)
   讓使用者確認。使用者明確肯定(「對」「可以」「沒錯」)才能呼叫寫入工具。
   模糊回應(「嗯」「應該吧」)一律視為未確認,要再問一次。
4. 今天日期是 {today},時區 Asia/Taipei——口語相對日期(「下週三」「月底前」)
   要換算成 YYYY-MM-DD 再放進 payload。
5. 使用者要求的操作若不在你的工具清單裡(改資料、刪除、查金額),
   明確回覆「這個操作目前不支援,請用系統介面」,不要假裝做了。
```

第 4 條是修正原 spec 的一個已知缺口(review handoff 時提過:LLM 不知道今天幾號會亂算相對日期)——這裡直接把當下日期注入,不留給 LLM 自己猜。

### 2.4 狀態機 → 文字模式簡化

| Voice 版狀態 | 文字版對應 |
|---|---|
| `idle` / `listening` | 使用者打字送出前,不需要狀態(聊天介面天然處理輪次) |
| `processing` | Agent 呼叫工具、推理中(UI 顯示 loading) |
| `clarifying` | Agent 回一句追問訊息,等下一輪輸入 |
| `confirming` | Agent 複述 + 顯示「確認 / 取消」兩顆按鈕(比純文字回覆「對/不對」更不會誤判) |
| `executing` | 使用者按確認 → 呼叫寫入工具 |
| `responding` | 顯示結果卡片 |

**逾時規則不適用文字模式**(沒有「等 15 秒」這回事,使用者可以隔一小時再回來,對話狀態留在 UI session 裡即可)。**但「未確認絕不寫入」鐵律完全保留**——`confirming` 狀態必須是明確按鈕點擊,不是自由文字猜測是否同意。

---

## 3. 實體對齊 UX(對齊 handoff §4.3)

| search_projects 結果 | Agent 行為 |
|---|---|
| 1 筆,高相似度 | 直接採用,複述時帶出完整案名(「幫你記到『磐頂長老教會』這個專案,對嗎?」)——使用者這時還有機會糾正 |
| 2-5 筆 | 用**選項按鈕**列出候選(比純文字讓使用者打字選更不會出錯),文字上也講清楚候選有哪些 |
| 0 筆 | 明講找不到,問要不要換個說法;明確告知「新增專案不支援語音/打字,請用系統介面」 |

---

## 4. 確認流程 UI(對齊 handoff §5,兩階段 token 由 Lab 1 已經做好)

```
Agent 複述:「要記到『磐頂長老教會』一筆工作記錄:『木作進場前先放樣』,對嗎?」
  ↓ 同時背景呼叫 propose_write,token 存在對話 session 裡(不顯示給使用者)
UI 顯示兩顆按鈕:[確認] [取消]
  ↓ 使用者點確認 → Agent 呼叫 log_note 帶 token → 顯示「已記錄」
  ↓ 使用者點取消 → 該筆作廢,token 過期不用管(60 秒 TTL 自然失效)
```

**實作硬化(比原規格再加一層防呆)**:LLM 的工具清單裡**根本不給它 `create_task`/`log_note` 這兩個真正寫入的工具**,只給 `propose_create_task`/`propose_log_note`(對應到 propose_write)。真正呼叫寫入的那一步,是使用者點 [確認] 按鈕時**由伺服器端直接呼叫**,不經過 LLM 再判斷一次——按鈕點擊送到後端是結構化的 `{ action: 'confirm' }`,不是自由文字,LLM 沒有機會誤判「使用者是不是同意了」。這跟契約本來的「LLM 沒有修改/刪除工具」同一個防禦邏輯:不讓 LLM 有能力做的事,比事後靠 prompt 教它不要做更可靠。

**Payload 若在確認前被使用者用文字修改**(例如「不是,改成放樣後才進場」)→ 整個提案作廢,重新走一次 propose_write(舊 token 用不到,契約層本來就會擋 payload mismatch)。

---

## 5. UI(最小可用,驗證對話品質用)

- 新路由 `web/app/voice-lab-chat/page.tsx`(暫不掛進 staff/boss 導覽,Lab 4 才決定正式入口放哪)
- 極簡聊天框:訊息列表 + 輸入框 + 送出;Agent 訊息若處於 `confirming` 狀態,額外渲染 [確認]/[取消] 按鈕
- 用暗色玻璃 token(`.nm-raised`、`.nm-input`、`.nm-btn-solid` 等),跟全站視覺一致,不用另外設計一套
- 認證:先簡化用 session-based(跟 `getSession()` 一樣),不用另外接 VOICE_API_KEY——**這個 UI 本身是老闆/員工登入後才看得到的內部頁面**,是 Agent 後端呼叫 Lab 1 工具時才用 VOICE_API_KEY(server-to-server),跟使用者登入是兩層

## 6. 後端路由

- `POST /api/voice-lab/chat`:body `{ session_id, message }` → 跑一輪 agent 迴圈(可能呼叫多個工具)→ 回傳 `{ reply, state: 'clarifying'|'confirming'|'responding', pending_confirmation?: {summary, action, payload} }`
- 對話歷史存哪:Phase 1 先用**記憶體 Map**(session_id → messages[]),不建 DB 表——這是驗證對話品質的實驗性 UI,重啟就清空可接受。若之後要正式上線再考慮持久化。**這點主動跟 Yen 講清楚,是刻意的簡化,不是疏漏。**

---

## 7. 驗證計畫

沒有像 Lab 1 那樣的契約測試(這裡不是接口,是對話品質),改用**腳本化對話案例**驗證,寫在 `voice-lab/lab2-conversation-cases.md`,涵蓋:

1. 單一動作、專案明確 → 一輪內完成(search → propose → confirm → write)
2. 專案名模糊,0 筆候選 → 正確追問
3. 專案名模糊,多筆候選 → 正確列出選項、使用者選了之後接得上
4. 使用者打「取消」→ 不寫入,token 作廢
5. 使用者用文字回「應該吧」而非明確肯定 → Agent 不能直接當作確認(此案例驗證我們**用按鈕**而非文字語意判斷確認與否,是為了徹底防呆這個案例)
6. 提到相對日期(「下週三」)→ 正確換算成絕對日期,且複述時講出絕對日期
7. 要求不支援的操作(「幫我把這筆金額改一下」)→ 明確拒絕,不假裝做了
8. 連續兩輪都指同一個專案(「再幫我記一筆」)→ 不用重新 search,沿用上一輪對齊到的 project_id

---

## 8. 交付定義(Definition of Done)

- [ ] Agent runtime + 6 個工具轉發完成
- [ ] 對話狀態機四態(clarifying/confirming/executing/responding)UI 正確顯示
- [ ] 8 個腳本化對話案例手動跑過,行為符合預期
- [ ] `tsc --noEmit` + `npm run build` 乾淨
- [ ] 未改動 Lab 1 契約與轉接層任何程式碼

---

## 範圍決定(2026-08-13 Yen 確認)

1. **LLM 供應商**:~~先只用 Anthropic~~ → **2026-08-14 改為雙 provider**(Yen 指示)。
   `.env.local` 的 `ANTHROPIC_API_KEY` 目前是空的,為了讓對話案例現在就跑得起來,
   加了 Kimi(Moonshot)轉接層 `lib/voice-agent-kimi.ts`。選擇邏輯沿用 `lib/ai-quote.ts`
   既有慣例:有 Anthropic key 就優先用,否則退 Kimi,兩個都沒有 → loud 503。
   runtime 內部仍只認 Anthropic 形狀的 tool_use 結構,轉接在 Kimi 那一層做完。
   **實測差異見 [lab2-conversation-cases.md](./lab2-conversation-cases.md) 結果表**——
   契約層防線(id、兩階段 token、確認只認按鈕)不因換模型而鬆動,但追問判斷、
   相對日期、複述措辭的品質有明顯落差。
2. **UI 入口**:✅ 獨立測試頁,不掛 staff/boss 導覽
3. **對話歷史**:✅ 記憶體存(重啟即清空),不建 DB 表

## 已知限制(Phase 1,誠實記錄不隱藏)

**actor 歸屬**:Lab 1 的 6 個工具端點固定用單一 `VOICE_ACTOR_USER_ID`(見 lab1 spec §4「Phase 1 單一使用者」),Lab 2 的 DoD 明講不改 Lab 1 契約/轉接層——所以**不管誰登入這個聊天頁測試,寫入的 actor 都會是 `VOICE_ACTOR_USER_ID` 指到的那個人**(目前是老闆),不是真正在打字的使用者。這是 Lab 1 就存在的已知簡化,不是 Lab 2 引入的新問題;多使用者綁定是 Lab 1 spec 已經寫的「Phase 2」項目,等這個 UI 真的要給多位員工用時(可能是 Lab 4 或更晚)再處理。
