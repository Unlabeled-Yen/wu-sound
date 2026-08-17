'use client';

// 報表列印:瀏覽器原生列印/另存 PDF,所見即所得——不用另外接 PDF 產生服務。
// 只印 .report-print-area 那個區塊(見 globals.css 的 @media print 規則)。
export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="nm-btn-solid text-[13px]">
      列印 / 輸出 PDF
    </button>
  );
}
