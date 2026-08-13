# catalog_items 覆蓋角(coverage_h_deg/coverage_v_deg)audit(2026-08-13)

**範圍**:11 支喇叭(CODA 4 支 + YAMAHA 3 支 + DHR12/DHR12M 兩組值 = 共 7 個品項需要查,回頭對到 round1 的 7 個 item_type='喇叭' 品項)。超低音(G15-SUB / U12i-Sub / U15-SUB)無方向性,不查,coverage_h_deg 留 null。
**憲章**:只信原廠、找不到就 loud、每個數字附 source URL。
**來源**:全數沿用 round1 已確認的原廠官網產品頁 Technical Specifications 表格(HTML),未取用經銷商 / 論壇。

---

| 品牌 | 型號 | coverage_h_deg | coverage_v_deg | 信心度 | 來源 | 備註 |
|---|---|---|---|---|---|---|
| CODA | D5-Cube | 90 | 90 | 高 | [CODA D5-Cube](https://codaaudio.com/speakers/d5-cube/) | Spec 表寫「Dispersion: 90° conical」,單一數值代表 H=V,無分開列 |
| CODA | G308i | 90 | 90 | 中 | [CODA G308-Pro](https://codaaudio.com/speakers/g308/) | Spec 表寫「Dispersion: 90° conical」;沿用 round1 同一頁命名疑慮(官網只有 G308-Pro,無獨立 G308i 頁面) |
| CODA | G512 | 90 | 60 | 高 | [CODA G512-Pro](https://codaaudio.com/speakers/g512-96/) | Spec 表寫「Dispersion: 90° horizontal / 60° vertical」,rotatable elliptical waveguide,分開列 H/V |
| CODA | HOPS8i | 100 | 100 | 高 | [CODA HOPS8i](https://codaaudio.com/speakers/hops8i/) | Spec 表寫「Dispersion: 100° conical」,單一數值代表 H=V |
| YAMAHA | CBR12 | 90 | 60 | 高 | [YAMAHA CBR specs](https://usa.yamaha.com/products/proaudio/speakers/cbr/specs.html) | Spec 表分開列 Horizontal 90° / Vertical 60° |
| YAMAHA | CHR12M | 90 | 90 | 高 | [YAMAHA CHR specs](https://usa.yamaha.com/products/proaudio/speakers/chr/specs.html) | Spec 表寫「Coverage Angle: H90° x V90°」,floor monitor 型,對稱覆蓋 |
| YAMAHA | DHR12 | 90 | 60 | 高 | [YAMAHA DHR specs](https://usa.yamaha.com/products/proaudio/speakers/dhr/specs.html) | Spec 表寫「H90° x V60° (Rotatable)」,可旋轉 waveguide,V 值較窄 |
| YAMAHA | DHR12M | 90 | 90 | 高 | [YAMAHA DHR specs](https://usa.yamaha.com/products/proaudio/speakers/dhr/specs.html) | 同一頁面,DHR12M 獨立列「H90° x V90°」,floor monitor 型,對稱覆蓋,跟 DHR12 明確不同 |

超低音(G15-SUB / U12i-Sub / U15-SUB):coverage_h_deg / coverage_v_deg 皆留 **null**——低音喇叭無方向性(omnidirectional),原廠 datasheet 不列擴散角,未搜。

---

## 找不到的項目

無。7 個查詢項目全數在原廠 Technical Specifications 表格中找到明確數值,信心度皆為「高」,僅 G308i 因型號命名疑慮(沿用 round1 已記錄的問題,官網無獨立 G308i 頁)降為「中」。

---

## 跟 round1 對照

- **HOPS8i**:round1 備註寫「100° conical dispersion」,這輪重查原廠頁確認精確措辭為「Dispersion: 100° conical」,數字**完全一致**,無出入。填入 coverage_h_deg=100、coverage_v_deg=100(conical 代表水平/垂直對稱)。
- **DHR12 vs DHR12M**:round1 備註已寫「DHR12(H90/V60 可旋轉)與 DHR12M(H90/V90)是不同型號」,這輪逐一在同一份 Yamaha DHR spec 頁確認兩組獨立數值:
  - DHR12 = H90° x V60°(Rotatable waveguide)
  - DHR12M = H90° x V90°(floor monitor,對稱)
  兩組數字**確認不同**,與 round1 記載一致,H 值相同但 V 值不同(60° vs 90°)。
- 其餘 5 項(D5-Cube、G308i、G512、CBR12、CHR12M)round1 沒有記錄擴散角備註,屬本輪新增資訊,無從對照。

---

**簽核前不動 DB**。Yen / 老闆 review 通過後,7 組 coverage_h_deg / coverage_v_deg 數字寫進 catalog_items 對應品項;3 個超低音品項 coverage_h_deg / coverage_v_deg 保持 null。
