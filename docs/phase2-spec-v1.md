# Phase 2 規格 v1 — 大型設備位置(2026-07-13)

## 為什麼是這個

雇主 17 題原話 Q5–Q7:

> 「都用我小巧笨拙的腦袋調度。設備出庫、回庫完全沒有記錄。損壞或維修中,我們三個人記著,某一個人追蹤。」

耗材/線材已經有含 ID 的清單(舒韶在記),痛點集中在**大型設備**:喇叭、控台、燈具、舞台結構、無線麥克風、投影機。系統唯一要回答一件事:**這件設備現在人在哪?**

## 範圍

**做**
- 大型設備一件一筆(以型號 + 序號區分)
- 狀態:庫房 / 出租/施工中(哪個案場)/ 維修中 / 淘汰
- 老闆:CRUD、移動、看歷史
- 員工:唯讀搜尋(手機、案場現場查「這型號還剩幾支」)
- 移動一律留 audit(誰、什麼時候、從哪到哪、備註)

**不做(留給後續)**
- 耗材/線材出入庫(已有 xlsx 系統,別替換沒壞的)
- CSV 匯入(先手動 seed 主要品項,實際用時分批補)
- 排程(雇主未主動提)
- 客戶端「該租哪些」的推薦(那是 Phase 3 報價的責任)

## 資料模型

### `equipment`
| 欄位 | 型別 | 說明 |
|---|---|---|
| id | uuid pk | |
| name | text | 「CODA HOPS8i」「Soundcraft 類比控台」等 |
| brand | text nullable | CODA / YAMAHA / Soundcraft / MA / … |
| model_number | text nullable | HOPS8i / X32 / MA2 light |
| category | equipment_category enum | 見下 |
| serial_number | text nullable | 有序號填(廠內流水或原廠)|
| quantity | integer default 1 | 一筆多件時(如 Blinder×100 line 材料類)|
| unit | text default '台' | 台/顆/座/組/支 |
| status | equipment_status enum | in_storage / on_site / in_repair / retired |
| current_site_id | uuid nullable fk → sites | status=on_site 時必填,別的狀態必須為 null(check) |
| notes | text nullable | |
| created_at, updated_at | timestamptz | |

**equipment_category** enum:
`speaker`, `subwoofer`, `amplifier`, `mixer`, `mic_wired`, `mic_wireless`, `di_box`, `light`, `light_console`, `stage`, `projector`, `rack`, `other`.

**equipment_status** enum: `in_storage`, `on_site`, `in_repair`, `retired`.

### `equipment_movements`
| 欄位 | 型別 | 說明 |
|---|---|---|
| id | bigserial pk | |
| equipment_id | uuid fk → equipment | |
| moved_by | uuid fk → users | 誰觸發 |
| moved_at | timestamptz default now() | |
| from_status | equipment_status | 移動前 |
| to_status | equipment_status | 移動後 |
| from_site_id | uuid nullable fk → sites | |
| to_site_id | uuid nullable fk → sites | |
| notes | text nullable | 例如「音圈燒了送 XX 維修中」|

每次 UPDATE status/current_site_id 都必須 INSERT 一筆 movement(server 保證,不靠 DB trigger,方便日後改)。

### RLS
沿用 Phase 1 模式:所有存取一律走 server 的 service_role,anon 全部拒絕。

## API

| Route | 誰 | 動作 |
|---|---|---|
| `GET /api/equipment` | 已登入 | list;query `?q=`(name/model)`&category=` `&status=` `&site_id=` |
| `POST /api/equipment` | boss | 新增 |
| `PATCH /api/equipment/[id]` | boss | 改基本欄位(name, brand, model_number, serial_number, quantity, unit, notes)——不改狀態/位置 |
| `POST /api/equipment/[id]/move` | boss | body `{to_status, to_site_id?, notes?}` → 更新 + insert movement + audit_log |
| `DELETE /api/equipment/[id]` | boss | 軟刪 → status=retired + audit(硬刪不做) |

**驗證(伺服端強制)**
- to_status='on_site' → to_site_id 必填
- to_status ∈ {'in_storage','in_repair','retired'} → to_site_id 必須為 null
- notes 對 in_repair 建議填但不強制

## UI

### 老闆
- `/boss/equipment` — 表列:設備名、品牌、型號、狀態(色 pill)、目前案場、動作(移動 / 編輯 / 刪除)。頂部:全文搜尋、分類 filter、狀態 filter、"新增設備"按鈕。
- `/boss/equipment/new` — 新增表單(name, brand, model_number, category, serial_number, quantity, unit, notes;預設 status=in_storage)。
- `/boss/equipment/[id]` — 詳情:基本欄位可編、狀態/位置只能透過「移動」按鈕改;下方 timeline 顯示 movements(最新在上)。
- 「移動」按鈕開 modal:選 to_status(radio)+ 若 on_site 顯示 site select + notes textarea + 送出。

### 員工
- `/staff/equipment` — 搜尋框(名/型號)+ 分類 filter;結果卡片顯示:設備名+型號、狀態、目前位置。**唯讀**,不能移動。
- Tab bar 加一個「設備」入口。

## 憲章對齊

- 位置與狀態的一致性由 server 驗證(check constraints + API 驗證雙保險),避免「on_site 卻沒 site_id」這種 silent 破洞
- 每筆移動 loud + audit,方便日後追溯「這支麥克風上次去哪」
- 員工端唯讀,避免員工誤操作變成新的資料黑洞;需要調度時走實體流程(LINE 問老闆),系統只記結果

## 種子資料

先手工塞雇主自報的清單當 demo(改天他實際用再更新):
- CODA HOPS8i × 2(8寸主動式)
- CODA 12寸主動式 × 2(型號待補)
- Soundcraft 類比控台 × 1
- Behringer X32 × 2
- MA2 light 燈控台 × 1
- 面燈 × 2
- LED BAR × 8
- Wash × 2
- 煙機 × 2
- Blinder × 100(當 stage/light 材料,quantity=100,unit=支)
- 移動式舞台 50×50 × 16 座
- 無線麥克風 × 6(型號待補)
- 投影機 × 1

放 `supabase/seeds/002_equipment.sql`。
