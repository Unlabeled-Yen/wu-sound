'use client';

// 報表列印:瀏覽器原生列印/另存 PDF,不用另外接 PDF 產生服務。
// 印的是 .report-print-area .print-only 那個獨立模板(見 globals.css),
// 不是把螢幕上的深色互動畫面直接印出來(17-reports-center.md §8,Q3 分離)。
//
// 裁決①(同文件 §1):任何一區讀取失敗即禁止列印,按鈕停用並寫明是哪一區——
// 一份有洞的財務文件不該存在。disabled 由呼叫端(ReportsView)依 loadError 算出。
export function PrintButton({ disabled, disabledReason }: { disabled?: boolean; disabledReason?: string | null }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      disabled={disabled}
      title={disabled ? (disabledReason ?? '資料讀取失敗,已停用列印') : undefined}
      className="nm-btn-solid text-[13px]"
      style={{ minHeight: 38, borderRadius: 11, fontSize: 12.5 }}
      data-export="print"
    >
      列印 / 輸出 PDF
    </button>
  );
}
