# 陣列設計器 — 需求規格 v1

> 對象:Wu 音響系統 `/tools/array-designer`。
> 目標:把 Uncoupled Array Designer v1.7(林立弘/聲合有限公司)的完整功能,
> 以乾淨室重製(clean-room)方式落地到 Wu 系統,並在 UI 上做編輯級優化。
> 底層演算法已於 Python 端跨檢驗 2081/2081(見 `develop/uncoupled-array-mcp/`)。

---

## 0. 現況 vs 目標(落差盤點)

原 app 有 **5 個分頁**、**畫布互動一整套**、**Splay(張角 β)參數**。目前 Wu 只做了 1 個分頁(Auto Mode)、靜態圖、沒有 β。

| 原 app 能力 | 底層公式驗證 | TS port | Wu UI | 本規格要補 |
|---|---|---|---|---|
| Auto Mode 分頁 | ✅ 945 組 | ✅ | ✅ | 視覺優化 |
| Quantity 分頁 | ✅ | ❌ | ❌ | **全補** |
| Unity 分頁 | ✅ | ❌ | ❌ | **全補** |
| Spacing 分頁 | ✅ | ❌ | ❌ | **全補** |
| Splay 分頁 | ✅ | ❌ | ❌ | **全補** |
| Splay(β) 輸入 | ✅ 1136 組含 β≠0 | primitives 有 | ❌ | **全補** |
| 畫布滾輪縮放 | — | ❌ | ❌ | **全補** |
| 畫布拖曳平移 | — | ❌ | ❌ | **全補** |
| 尺規量測工具 | — | ❌ | ❌ | **全補** |
| 圖層開關(Grid/XY/Angles/Lines/Coverage) | — | ❌ | ❌ | **全補** |
| 明暗主題切換 | — | ❌ | ❌ | 評估(見 §5) |
| 喇叭角度標籤 + 座標 | — | ❌ | ❌ | **全補** |
| Overlap Limit Arc | — | ❌ | ❌ | **全補** |
| 覆蓋著色(Coverage) | — | ❌ | 部分 | 補強 |

---

## 1. 工作項目分解(WBS)

### WBS-A 演算法補完(TypeScript)
- **A1** port `tabQuantity` / `tabUnity` / `tabSpacing` / `tabSplay` 到 `lib/array-designer.ts`
- **A2** 補完 β≠0 的 UI Range projection(`calcProjectedRange`)—— 見 §4 已知限制;
  可用 oracle 自動抓 golden,不需人工。
- **A3** 為四個 tab 各建 golden CSV,接進 vitest 回歸(比照 Auto Mode 的 946 組模式)

### WBS-B 分頁 UI 重構
- **B1** 頁面改為 5 分頁結構(Auto Mode / Quantity / Unity / Spacing / Splay)
- **B2** 每個分頁的輸入欄位 + 輸出欄位(精確欄位見 §3)
- **B3** 分頁切換保留各自狀態(切走再切回不清空)

### WBS-C 畫布互動引擎
- **C1** 世界座標 ↔ 螢幕座標轉換層(zoom_factor + pan_x/pan_y)
- **C2** 滾輪縮放(以鼠標位置為中心)
- **C3** 拖曳平移
- **C4** Reset View(復位縮放平移)
- **C5** 尺規量測(點兩點顯示距離,螢幕座標→物理座標)
- **C6** 鼠標懸浮顯示當前物理座標
- **C7** 圖層開關列:Grid / X,Y / Angles / Lines / Coverage

### WBS-D 圖表視覺(參考 lifeflat + 原 app)
- **D1** 視覺語言改用 lifeflat 單色編輯風(見 §5)
- **D2** 喇叭符號(梯形,可依 β 傾斜)+ 每支的角度標籤 + 座標
- **D3** 標線系統:Aud / Min / Max / Unity / Limit(Overlap Limit Arc)
- **D4** 覆蓋著色(Coverage 開)
- **D5** 間距標註(D = x.x m 雙箭頭)

### WBS-E QA
- **E1** 依 §3 欄位規格寫功能 QA
- **E2** 依 §6 應用場景寫情境 QA
- **E3** 畫布互動 QA(縮放/平移/量測/圖層)
- **E4** golden 回歸自動化(CI 綠燈門檻)

---

## 2. 通用符號約定

沿用 McCarthy 教科書符號(角度輸入為度,內部轉弧度):

| 符號 | 意義 | 單位 |
|---|---|---|
| N | 喇叭數量 | 支 |
| S | 相鄰喇叭間距 | m |
| β (beta) | 張角 / Splay | deg |
| φ (phi) | 單支喇叭 -6dB 名義覆蓋角 | deg |
| D | 觀眾席距離 | m |
| W | 目標覆蓋寬度 | m |

---

## 3. 五個分頁的精確欄位規格

> 欄位名逐字取自原 app 反編譯 bytecode(clean-room:只讀介面 metadata,不讀實作表達式)。
> 「內部變數名」列僅供 port 對照,不出現在 UI。

### 3.1 Auto Mode(已完成,列出供對照)

| 輸入 | 內部名 | 預設 |
|---|---|---|
| Target Width (m) | a_width | 22 |
| Audience Dist (m) | a_dist | 3 |
| Speaker Cov (deg) | a_speaker | 90 |
| Force Qty | a_qty_mode | Auto/Odd/Even |

| 輸出 | 說明 |
|---|---|
| Rec. Quantity (pcs) | 建議數量 |
| Rec. Spacing (m) | 建議間距 |
| Coverage Width (-3dB) (m) | 實際覆蓋寬度 |
| Range (Min ~ Max) (m) | 有效覆蓋深度範圍 |

### 3.2 Quantity 分頁 — Find Quantity (N)

| 輸入 | 內部名 | 預設 |
|---|---|---|
| Target Width (m) | q_width | — |
| Spacing (m) | q_spacing | — |
| Speaker Cov (deg) | q_speaker | 110 |

| 輸出 | 內部名 |
|---|---|
| Unity Dist (-6dB) (m) | (計算) |
| Required Qty (pcs) | — |
| Rec. Width (-3dB) (m) | — |
| Max Width (-6dB) (m) | — |
| Range (Min ~ Max) (m) | — |

### 3.3 Unity 分頁 — Find Unity Distance

| 輸入 | 內部名 | 預設 |
|---|---|---|
| Quantity (pcs) | u_qty | — |
| Spacing (m) | u_spacing | 7.0 |
| Splay (deg) | u_splay | 0.0 |
| Speaker Cov (deg) | u_speaker | 110 |

| 輸出 |
|---|
| Unity Dist (-6dB) (m) |
| Rec. Width (-3dB) (m) |
| Max Width (-6dB) (m) |
| Range (Min ~ Max) (m) |

### 3.4 Spacing 分頁 — Find Spacing

| 輸入 | 內部名 | 預設 |
|---|---|---|
| Quantity (pcs) | s_qty | — |
| Target Unity (m) | s_dist | — |
| Splay (deg) | s_splay | 0.0 |
| Speaker Cov (deg) | s_speaker | 110 |

| 輸出 |
|---|
| Req. Spacing (m) |
| Rec. Width (-3dB) (m) |
| Max Width (-6dB) (m) |
| Range (Min ~ Max) (m) |

### 3.5 Splay 分頁 — Find Splay

| 輸入 | 內部名 | 預設 |
|---|---|---|
| Quantity (pcs) | p_qty | — |
| Target Unity (m) | p_dist | 3.5 |
| Spacing (m) | p_spacing | 5.0 |
| Speaker Cov (deg) | p_speaker | 110 |

| 輸出 |
|---|
| Req. Splay (deg) |
| Rec. Width (-3dB) (m) |
| Max Width (-6dB) (m) |
| Range (Min ~ Max) (m) |

---

## 4. 畫布互動規格(WBS-C 展開)

原 app 的畫布方法(反編譯確認):`do_zoom` / `do_pan` / `draw_diagram` /
`toggle_measure` / `reset_view` / `screen_to_phys`。

| 功能 | 行為 | 對應原 app |
|---|---|---|
| 滾輪縮放 | 以鼠標位置為錨點縮放,不是以畫布中心 | `do_zoom(event, delta)` 用 pan 補償 |
| 拖曳平移 | 按住拖動移動視圖,更新 pan_x/pan_y | `do_pan` / `start_pan` / `end_pan` |
| Reset View | zoom=1, pan=0,回到預設視野 | `reset_view` |
| 尺規量測 | 開啟後點兩點,顯示兩點間物理距離(m) | `toggle_measure` + `measure_points` |
| 座標懸浮 | 鼠標在畫布內即時顯示 (x, y) 物理座標 | `screen_to_phys` |
| 圖層開關 | Grid / X,Y / Angles / Lines / Coverage 各自可開關 | `show_grid` / `show_lines` 等 |

**縮放/平移的座標數學**(C1 核心):
```
screen_x = origin_x + (world_x * scale * zoom) + pan_x
screen_y = origin_y + (world_y * scale * zoom) + pan_y
world_x  = (screen_x - origin_x - pan_x) / (scale * zoom)   // screen_to_phys 反算
```

---

## 5. UI 視覺規格(參考 lifeflat)

lifeflat 是單色灰階編輯風設計語言(見 `mono-tokens.js`)。核心:**明度即數據,最重要 = 最黑**;發絲線網格;Inter 字體;大量留白;可數刻度。

### 5.1 兩種底(對應 Coverage 圖 vs Wu 頁面殼)
- **暗卡模式**(給覆蓋圖畫布,對應原 app 深色畫布 + lifeflat DARK):
  底 `#1C1C1A`、主墨 `#F0EFEB`、網格 `#2E2D29`、次級 `#8F8E88`
- **Wu 頁面殼**:維持現有 neumorphism 暗色主題(不動),圖畫布嵌在其中

### 5.2 標線配色【已定案 Q1】

**保留原 app 色系,但降飽和;線條與數據呈現的設計語法按 lifeflat。**

- **顏色**:沿用原 app 語意配色(Aud 紫 / Min·Max 紅 / Unity 黃 / Limit 灰 / 覆蓋錐藍),
  但每色降飽和度,避免螢光刺眼,往 lifeflat 的沉靜編輯感靠。建議做法:HSL 降 S 約 30–45%、
  必要時降 L,使其像「印在紙上的墨色」而非發光的螢幕色。
- **線條設計(按 lifeflat)**:網格用發絲線 0.5px;標線粗細分層(主標線 1.4px、次要 1px、輔助 0.5px);
  虛實線型區分功能(Aud 長虛、Min 短點、Max 疏虛、Limit 細灰)。
- **數據呈現(按 lifeflat)**:Inter 字體;數值 weight 800;軸標籤 9.5px/600;
  大量留白;可數刻度;標籤帶單位文字而非只靠顏色。
- **原則**:顏色只做「語意分類」,不做「視覺主角」;讀圖靠的是排版、線型、明度層次(lifeflat 精神)。

### 5.3 字體與刻度
- Inter 字體(lifeflat 指定)
- 軸標籤 9.5px / weight 600
- 數值 weight 800
- 網格發絲線 0.5px

### 5.4 主題切換(原 app 有 Light 按鈕)
- 評估項:Wu 頁面本身是暗色,畫布暗卡已一致。Light 模式優先級低,列為 stretch。

---

## 6. 已知限制(誠實標注,不編造)

### 6.1 β(Splay)≠ 0 時的 UI Range Min/Max 投影 —— 已解決(WBS-A2)

- 原限制:Unity / Spacing / Splay / Quantity 四分頁,β≠0 時 `Range (Min ~ Max)`
  顯示欄的 `val_max` 無法用封閉公式算,曾直接對發散量做插值,誤差達 12.7%。
- **解法**:改對有界比值 `val_max / d_max` 做雙線性插值(oracle 探測網格),
  誤差收斂到 0.11%(2000 組隨機探測)。見 `physics.py::calc_projected_range`
  的 `_VMAX_RATIO_TABLE`,TS 對應 `array-designer.ts` 同名表。
- **驗證覆蓋**:5081/5081(945+1136+3000 組)golden 全過,含 β≠0 情境。
  見 `develop/uncoupled-array-mcp/KNOWN_GAPS.md`。
- 現狀:β≠0 時 Range 欄**正常顯示數字**,不再是「—(未驗證)」。

### 6.2 畫布視覺化幾何 —— 已用 ground truth 執行法驗證

- 原限制:Min/Max、Unity/Limit 兩組線段的畫法,前兩輪都是**照截圖用肉眼猜的**,
  猜錯了兩次(Min/Max 誤畫成單一線段;Unity 誤畫成兩喇叭收斂三角形)。
- **解法**:把原軟體 `draw_diagram` 綁到假 canvas 上真執行,記錄每筆
  `create_line`/`create_text` 的真實座標與顏色鍵,拿到 ground truth 後重繪。
  腳本:`develop/uncoupled-array-mcp/dev/execute_draw_diagram.py`。
- 完整對應表(每個視覺元素↔公式↔驗證方式)見
  [visual-mapping.md](visual-mapping.md)。
- 現狀:Min/Max 雙箭頭接力、Unity/Limit 雙色射線,結構皆已用 ground truth
  座標核對通過(N=5, D=3, φ=120° 對照案例,Min/Max/Unity/Limit/Aud 五項標籤
  全部與原軟體截圖吻合)。

此限制符合 Wu 系統「靜默失效零容忍」憲章:上線前的每一項都已用 oracle 或
ground truth 執行驗證過,沒有靠猜的。

---

## 7. 決策定案

| # | 項目 | 定案 |
|---|---|---|
| Q1 | 標線配色 | **保留原色系但降飽和;線條/數據呈現按 lifeflat**(見 §5.2) |
| Q2 | 畫布互動 | **縮放 + 平移 + 量測全做**(WBS-C 全做) |
| Q3 | β≠0 Range 投影 | **已完成(WBS-A2)** —— 比值查表插值,5081/5081 golden 通過 |
| Q4 | 分頁範圍 | **完整 5 分頁** |
| Q5 | 主題切換(Light) | stretch,優先級低,不擋上線 |

---

## 8. 應用場景(給 QA 用)

| 場景 | 使用者 | 流程 | 用哪個分頁 |
|---|---|---|---|
| SC1 快速估配置 | 老闆/資深員工 | 知道場地寬+觀眾距離+喇叭覆蓋角,要幾支 | Auto Mode |
| SC2 已知間距求數量 | 工程 | 場地限制間距固定(如吊點),求要幾支 | Quantity |
| SC3 已知數量求覆蓋深度 | 工程 | 手上就 N 支,問覆蓋範圍夠不夠深 | Unity |
| SC4 求間距 | 工程 | 定數量、定目標交會深度,求間距 | Spacing |
| SC5 求張角 | 工程 | 定數量/間距/目標深度,求每支要掰多少度 | Splay |
| SC6 現場複核 | 現場 | 用尺規量測畫布上任意兩點距離對照現場 | 畫布工具 |
| SC7 細看某支 | 工程 | 縮放平移看某支喇叭的角度與座標 | 畫布工具 |
