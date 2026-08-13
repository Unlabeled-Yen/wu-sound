# catalog_items 聲學規格 Round 1 audit (2026-08-13)

**範圍**：13 項（CODA 7 支喇叭/超低音 + CODA 1 台擴大機 + YAMAHA 4 支喇叭 + YAMAHA 1 台擴大機），對應 SPL 計算器需要的四個欄位（max_spl_db / spl_ref_distance_m / sensitivity_db_1w1m / amp_power_w）。
**憲章**：只信原廠、找不到就 loud、每個數字附 source URL、Yen/老闆 review 通過後才寫進 DB。
**來源全數為原廠官網產品頁 Specifications 區塊（HTML）**；未取用經銷商 / Sweetwater / B&H / 論壇。

---

## 喇叭 / 超低音

| 品牌 | 型號 | max_spl_db | spl_ref_distance_m | sensitivity_db_1w1m | 信心度 | 來源 | 備註 |
|---|---|---|---|---|---|---|---|
| CODA | D5-Cube | 117 | 1 | 91 | 高 | [CODA D5-Cube](https://codaaudio.com/speakers/d5-cube/) | 被動 2-way，16Ω；Peak SPL；量測條件 half-space。註：D5-Cube 只能配 LINUS 擴大機用 |
| CODA | G308i | 124 | 1 | 94.5 | 中 | [CODA G308-Pro](https://codaaudio.com/speakers/g308/) | ⚠️ 官網只有 G308-Pro 主頁面，寫「Optional as G308 variant for installation applications」——把 "i" 當成 install 版，acoustic engine 與 G308-Pro 相同；被動 8Ω；Peak（6dB crest，half-space）。若老闆手上是特殊 SKU 請對照序號 |
| CODA | G512 | 132 | 1 | 98 | 高 | [CODA G512-Pro](https://codaaudio.com/speakers/g512-96/) | 對應原廠 G512-Pro；被動 8Ω，crossover 1300 Hz passive；Peak SPL |
| CODA | HOPS8i | 133.5 | 1 | 98 | 高 | [CODA HOPS8i](https://codaaudio.com/speakers/hops8i/) | ⭐ 校準點，見下方單獨段落；被動 8Ω；Peak dB(A)，量測為 pink noise 12 dB crest A-weighted；100° conical dispersion |
| CODA | G15-SUB | 138 | 1 | 101 | 高 | [CODA G15-Sub](https://codaaudio.com/speakers/g15-sub/) | 超低音；8Ω；量測 half-space；38 Hz–180 Hz (-6dB)；需搭 LINUS 擴大機 |
| CODA | U12i-Sub | 130 | 1 | 95 | 高 | [CODA U12i-Sub](https://codaaudio.com/speakers/u12i-sub/) | ⚠️ 超低音；**4Ω**（非 8Ω，配 Linus6.4 時要注意，見擴大機備註）；壁掛型薄款 |
| CODA | U15-SUB | 133 | 1 | 97 | 高 | [CODA U15-Sub](https://codaaudio.com/speakers/u15-sub/) | ⚠️ 超低音；**4Ω**；量測 half-space；35 Hz–150 Hz (-6dB) |
| YAMAHA | CBR12 | 125 | 1 | 96 | 高 | [YAMAHA CBR Series specs](https://usa.yamaha.com/products/proaudio/speakers/cbr/specs.html) | 被動 8Ω；Peak SPL (Calculated) |
| YAMAHA | CHR12M | 123 | 1 | 93 | 高 | [YAMAHA CHR Series specs](https://usa.yamaha.com/products/proaudio/speakers/chr/specs.html) | 被動 8Ω；Peak SPL (Calculated)；地板 monitor 型 |
| YAMAHA | DHR12 | 130 | 1 | (null，主動) | 高 | [YAMAHA DHR Series specs](https://usa.yamaha.com/products/proaudio/speakers/dhr/specs.html) | 主動；1000W Class-D；量測 peak IEC noise @ 1m；⚠️ 注意 DHR12（H90/V60 可旋轉）與 DHR12M（floor monitor，H90/V90，129 dB）是不同型號，不要混用 |
| YAMAHA | HS5 | **查無** | — | — | — | [YAMAHA HS Series specs](https://usa.yamaha.com/products/proaudio/speakers/hs_series/specs.html) | ⚠️⚠️ **錄音室監聽 studio monitor，慎用於場地覆蓋估算**；且 Yamaha 官方 spec sheet **完全沒列 max SPL**，只列頻率響應 54Hz–30kHz、bi-amp 70W (LF 45W+HF 25W)。網上流傳的「101 dB」值來自第三方量測（Sound On Sound、AudioScienceReview 等），非原廠——依憲章不進 DB。建議在 catalog 標 `is_studio_monitor = true` 或直接不進 SPL 計算 |

## 擴大機

| 品牌 | 型號 | amp_power_w (8Ω) | 信心度 | 來源 | 備註 |
|---|---|---|---|---|---|
| CODA | Linus6.4i | 500 | 高 | [CODA LINUS6.4](https://codaaudio.com/electronics/linus6-4/) | **RMS 連續功率 500W @ 8Ω / channel**（4 channels）；4Ω = 800W/ch，2Ω = 1500W/ch；Burst 峰值 1000W @ 8Ω。⚠️ Yen 標的型號是 "Linus6.4i"，原廠 electronics 頁只有 "LINUS6.4"（含 -ID 變體），假設是同一台；若是特殊 install "i" 變體請跟老闆確認 |
| YAMAHA | PX3 | 300 | 高 | [YAMAHA PX Series specs](https://usa.yamaha.com/products/proaudio/power_amps/px_series/specs.html) | ⚠️ **這個 300W @ 8Ω 是 "1kHz Non-clip 20msec Burst, Both channels driven"**，Yamaha 用 burst 為主要規格數字、**沒有另外公布 continuous RMS**。用於 SPL 預算估算時記得這比 continuous RMS 樂觀。4Ω = 500W/ch；2 channels；Power Boost Mode 單聲道 8Ω = 600W |

---

## 校準點：CODA HOPS8i

**我找到的值**：Max SPL = **133.5 dB (A)** @ 1m，Sensitivity 98 dB @ 1W/1m，被動 8Ω。
**來源**：CODA Audio 官網產品頁 [https://codaaudio.com/speakers/hops8i/](https://codaaudio.com/speakers/hops8i/)（Technical Specifications 表格）。
**量測條件**：pink noise 12 dB crest factor, A-weighted（比 6 dB crest 保守，比純 sine 樂觀；這是 CODA 全系列一致的量法）。

老闆記憶對照：**如果老闆 phase 3 實測 HOPS8i 記得的最大聲壓與 133.5 dB @ 1m 差 3 dB 以上（例如記成 128 dB 或 137 dB），那可能是 (a) 我拿錯型號（HOPS8T 觸控式 vs HOPS8i install 版看規格書寫是共用一份 datasheet，但 codaaudio.com 個別產品頁的數字才是最新的），或 (b) 老闆記的是 continuous 值不是 peak，或 (c) 老闆的 phase 3 場景有 EQ / limiter 保護吃掉了頂端**。差 3 dB 以內視為正常，因為 datasheet 是理想條件、現場一定會低。

---

## 找不到的項目

**YAMAHA HS5** — max SPL 沒進來。

搜過並排除的來源：
- Yamaha 官方 HS Series specs 頁 [https://usa.yamaha.com/products/proaudio/speakers/hs_series/specs.html](https://usa.yamaha.com/products/proaudio/speakers/hs_series/specs.html) —— 完整規格表沒列 max SPL 一欄
- Yamaha 官方 shop 頁 [shop.usa.yamaha.com/en/p/hs-series-studio-monitors/hs5-...](https://shop.usa.yamaha.com/en/p/hs-series-studio-monitors/hs5-5-powered-studio-monitor) —— 301 redirect 回上面同一頁
- 沒去撈 Sound On Sound、AudioScienceReview 等第三方量測（依憲章不採用）

**結論**：Yamaha 對 studio monitor 系列刻意不公布 max SPL（合理：這類產品標榜的是準確度而非音量，公布 max SPL 會被誤用於場地估算）。這正好對應老闆「HS5 是不是本來就不該進 SPL 計算」的直覺——建議 Round 2 討論從 catalog 加註 `is_studio_monitor` 欄位或 UI 提示。

---

## Round 2 建議 / 待決事項

1. **HS5 定位**：建議 Yen 跟老闆確認：HS5 是不是根本不該進 `/tools/spl-calculator`？如果要留，考慮加 `is_studio_monitor boolean` 欄位或在 UI 顯眼標「監聽用途、SPL 估算不準」警告。
2. **CODA G308i 命名**：老闆手上的到底是原廠 G308-Pro（touring）還是 G308（installation variant）？兩者 acoustic engine 相同，但機構/吊掛不同。若真的是 pendant 吊燈式，可能是別的系列（G308F flange 或 D 系列吊裝款）；請對照序號或實體。
3. **CODA Linus6.4i vs Linus6.4**：原廠 electronics 頁只列 "LINUS6.4" 與 "LINUS6.4-ID"（後者 ID = Install / Distributed）。老闆記為 "Linus6.4i" 可能就是 -ID 版；擴大機聲學規格通常共用。請確認實體背板銘牌型號。
4. **CODA U12i-Sub / U15-SUB 是 4Ω 不是 8Ω**：這兩支超低音配 Linus6.4 時，4Ω 檔位功率 800W/ch，不是 8Ω 檔的 500W。SPL 計算器餵資料時要用對阻抗檔的功率，否則會低估 2 dB 左右。
5. **PX3 功率是 burst 不是 continuous RMS**：Yamaha 官方主打數字 300W @ 8Ω 是 20ms burst，如果拿去跟 CODA Linus6.4 的 500W @ 8Ω RMS 直接比會失真（PX3 continuous 可能只有 200W 級）。SPL 計算器若需要 apples-to-apples 比較，建議另外抓 continuous 值或在 UI 標註量測法差異。
6. **CODA 全線需搭 LINUS**：D5-Cube / G15-SUB / U 系列 spec 頁都明講「exclusively designed to work with CODA LINUS amplifiers」；如果 catalog 允許自由配對，需在 UI 標「原廠指定擴大機」限制，否則 AI 建議會出現實務上不可行的配置。

---

**簽核前不動 DB**。Yen / 老闆 review 通過後，13 項數字寫進 catalog_items 對應欄位；HS5 一項保留 null 並補 `is_studio_monitor` 或 UI 警語決議。
