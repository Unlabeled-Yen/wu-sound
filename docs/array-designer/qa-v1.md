# 陣列設計器 — QA 測試計畫 v1

> 依 `spec-v1.md` 的欄位規格(§3)、畫布互動(§4)、應用場景(§8)撰寫。
> 每條 QA 標注:**類型**(功能/邊界/回歸/互動/視覺)、**前置**、**步驟**、**預期**、**驗證方式**。
> 驗證方式分:`auto`(vitest/golden 自動)、`browser`(瀏覽器實測)、`manual`(人工目視)。

---

## A. 演算法正確性(auto — golden 回歸)

> 門檻:每個分頁對原 app oracle 產的 golden CSV,顯示層(1 位小數)100% 一致才算過。

| ID | 分頁 | 測試 | 預期 | 方式 |
|---|---|---|---|---|
| A-01 | Auto Mode | 現有 945 組 golden | 945/945 綠 | auto |
| A-02 | Quantity | 新建 ≥300 組 golden(W×S×φ 掃描) | 全綠 | auto |
| A-03 | Unity | 新建 ≥300 組(N×S×β×φ,含 β≠0) | 全綠 | auto |
| A-04 | Spacing | 新建 ≥300 組(N×D×β×φ,含 β≠0) | 全綠 | auto |
| A-05 | Splay | 新建 ≥300 組(N×D×S×φ) | 全綠 | auto |
| A-06 | β≠0 Range 投影 | 補完後 ≥50 組 β≠0 golden | 全綠,或明確標「未驗證」 | auto |
| A-07 | 全分頁交叉 | 同一組參數在不同分頁互為逆運算(如 Quantity 求出 N,丟回 Unity 應得回原 D) | 往返誤差 < 顯示精度 | auto |

---

## B. 分頁欄位與狀態(browser)

| ID | 測試 | 步驟 | 預期 |
|---|---|---|---|
| B-01 | 5 分頁存在 | 開頁 | 見 Auto Mode/Quantity/Unity/Spacing/Splay 五個分頁籤 |
| B-02 | Quantity 欄位 | 切到 Quantity | 輸入:Target Width/Spacing/Speaker Cov;輸出:Unity Dist/Required Qty/Rec.Width/Max Width/Range |
| B-03 | Unity 欄位 | 切到 Unity | 輸入:Quantity/Spacing/**Splay**/Speaker Cov;輸出 4 項 |
| B-04 | Spacing 欄位 | 切到 Spacing | 輸入:Quantity/Target Unity/**Splay**/Speaker Cov;輸出 4 項 |
| B-05 | Splay 欄位 | 切到 Splay | 輸入:Quantity/Target Unity/Spacing/Speaker Cov;輸出 Req.Splay + 3 項 |
| B-06 | 分頁狀態保留 | Quantity 填值→切 Unity→切回 | Quantity 的值還在,沒被清空 |
| B-07 | 預設值 | 各分頁初次開啟 | Speaker Cov 預設 110(原 app 預設);Splay 預設 0.0 |
| B-08 | 圖同步 | 任一分頁改輸入 | 右側覆蓋圖即時重繪對應 N/S/β/φ |

---

## C. 邊界與錯誤處理(browser)

| ID | 測試 | 輸入 | 預期 |
|---|---|---|---|
| C-01 | 覆蓋角 0 | φ=0 | 友善提示,不崩潰,不留舊結果 |
| C-02 | 覆蓋角 ≥180 | φ=200 | 友善提示 |
| C-03 | 負數 | W 或 D 或 S 為負 | 友善提示 |
| C-04 | 超出喇叭上限 | 極大 W + 極小 D | 中文友善訊息(非 `N=xxxx 超過 MAX_SPEAKERS`) |
| C-05 | β ≥ φ | Splay 分頁 β 逼近/超過 φ | 正確處理(d_max→0 或標未驗證),不崩潰 |
| C-06 | β = φ/2 崩潰邊界 | Unity 分頁 β=φ/2 附近 | d_max 巨大但有限,不 NaN |
| C-07 | 空輸入 | 欄位清空 | 提示需填,不顯示 NaN |
| C-08 | 非數字 | 貼入文字 | 擋下,不崩潰 |
| C-09 | Splay tab S>2D | Splay 分頁 S 過大 | loud 提示「無有效 splay 解」 |

---

## D. 畫布互動(browser + manual)

| ID | 測試 | 步驟 | 預期 |
|---|---|---|---|
| D-01 | 滾輪縮放 | 鼠標移到某支喇叭上滾輪放大 | 以鼠標位置為中心放大,那支喇叭不跑掉 |
| D-02 | 縮小 | 反向滾輪 | 平順縮小 |
| D-03 | 拖曳平移 | 按住畫布拖動 | 視圖跟著移動 |
| D-04 | Reset View | 縮放平移後按 Reset View | 回到預設視野(zoom=1, pan=0) |
| D-05 | 尺規量測 | 開尺規→點兩點 | 顯示兩點物理距離(m),數字合理 |
| D-06 | 量測對照 | 量已知間距 S 的兩支喇叭 | 量到的值 ≈ S |
| D-07 | 座標懸浮 | 鼠標移入畫布 | 即時顯示 (x, y) 物理座標 |
| D-08 | Grid 開關 | 切 Grid | 網格顯示/隱藏 |
| D-09 | X,Y 開關 | 切 X,Y | 座標軸標籤顯示/隱藏 |
| D-10 | Angles 開關 | 切 Angles | 每支喇叭角度標籤顯示/隱藏 |
| D-11 | Lines 開關 | 切 Lines | 覆蓋射線顯示/隱藏 |
| D-12 | Coverage 開關 | 切 Coverage | 覆蓋著色顯示/隱藏 |
| D-13 | 縮放後量測仍準 | 放大 3x 後量測兩點 | 物理距離不受縮放影響,仍準確 |

---

## E. 圖表視覺(manual — 目視比對原 app 截圖)

| ID | 測試 | 預期 |
|---|---|---|
| E-01 | 喇叭符號 | 梯形喇叭圖示(非方塊),β≠0 時傾斜 |
| E-02 | 角度標籤 | 每支上方顯示該支傾角(如 -0.0°、含 β 時遞增) |
| E-03 | 座標標籤 | 每支顯示 (x, y) 座標 |
| E-04 | Aud 線 | 觀眾席距離水平線 + 標籤 |
| E-05 | Min/Max 線 | Min Gap Depth / Max Depth 標線 + 數值 |
| E-06 | Unity 標記 | -6dB 交會點標記 + 數值 |
| E-07 | Limit 弧 | Overlap Limit Arc(原 app 灰弧)有畫出 |
| E-08 | 間距標註 | D = x.x m 雙箭頭 |
| E-09 | lifeflat 風格 | 單色灰階、發絲線網格、Inter 字體、留白到位 |
| E-10 | 覆蓋著色 | Coverage 開時錐狀著色合理疊加 |

---

## F. 應用場景端到端(browser — 依 spec §8)

| ID | 場景 | 步驟 | 預期 |
|---|---|---|---|
| F-01 | SC1 快速估配置 | Auto Mode 填 22/3/90 | N=6, S=4.2, CovW=24.2(對原 app 截圖) |
| F-02 | SC2 已知間距求數量 | Quantity 填 W=28/S=7/φ=110 | Required Qty=5(對原 app 截圖二) |
| F-03 | SC3 已知數量求深度 | Unity 填 N=5/S=7/β=0/φ=110 | Unity=4.3, Range 2.5~4.9(對截圖三) |
| F-04 | SC4 求間距 | Spacing 填 N=5/Unity=4/β=0/φ=110 | Req.Spacing=6.6(對截圖四) |
| F-05 | SC5 求張角 | Splay 填 N/D/S/φ | Req.Splay 合理,對 oracle |
| F-06 | SC6 現場複核 | 用尺規量畫布 | 量測值對照計算值一致 |
| F-07 | SC7 細看某支 | 縮放平移到某支 | 角度/座標清楚可讀 |

> F-01~F-04 的預期值直接取自 Yen 提供的原 app 截圖,是最硬的對標基準。

---

## G. 回歸與部署(auto)

| ID | 測試 | 預期 |
|---|---|---|
| G-01 | `npm run test` | 全部 golden 綠(Auto + 4 分頁 + β≠0) |
| G-02 | `npx tsc --noEmit` | 零型別錯誤 |
| G-03 | SPL calculator 未受波及 | 版面/計算不變(共用 layout) |
| G-04 | Console 無錯誤 | 各分頁操作 console 乾淨 |
| G-05 | 桌面版面 | ≥1024px 兩欄(輸入左/圖右),窄螢幕自動疊 |

---

## H. QA 執行優先序

1. **G-01/G-02**(回歸底線)先綠,才動 UI
2. **A-02~A-06**(四分頁 + β≠0 演算法)—— 沒有正確數字,UI 再漂亮都沒意義
3. **F-01~F-05**(對原 app 截圖硬對標)—— 證明重現真的成立
4. **B / C**(欄位、邊界)
5. **D**(畫布互動)
6. **E**(視覺,最後打磨)

> 原則(Wu 憲章):任何一條 A 類或 F 類紅燈 → 不上線。視覺(E)可漸進優化,不擋上線。
