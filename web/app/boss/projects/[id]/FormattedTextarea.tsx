'use client';

import { useRef } from 'react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  autoFocus?: boolean;
}

type LineMode = 'large' | 'medium' | 'normal' | 'bullet' | 'number';

function ToolbarButton({ label, title, bold, onClick }: { label: string; title: string; bold?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="nm-btn nm-focus"
      style={{ padding: '4px 10px', minHeight: 'auto', fontSize: 12.5, fontWeight: bold ? 700 : 500 }}
    >
      {label}
    </button>
  );
}

// 備忘欄位工具列——只做這個面板需要的幾種格式,不是完整的富文字編輯器。
// 用純文字標記(# / ## / **粗體** / - / 1.)寫進 value 裡,顯示時交給
// task-format.tsx 的 renderTaskTitle 轉成真的大小字/粗體/清單。
export default function FormattedTextarea({ value, onChange, placeholder, rows = 10, autoFocus }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function applyInline(before: string, after: string) {
    const el = ref.current;
    if (!el) return;
    const s = el.selectionStart;
    const e = el.selectionEnd;
    const selected = value.slice(s, e);
    const next = value.slice(0, s) + before + selected + after + value.slice(e);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + before.length, s + before.length + selected.length);
    });
  }

  function applyLineMode(mode: LineMode) {
    const el = ref.current;
    if (!el) return;
    const s = el.selectionStart;
    const e = el.selectionEnd;
    const lineStart = value.lastIndexOf('\n', s - 1) + 1;
    const nlIdx = value.indexOf('\n', e);
    const lineEnd = nlIdx === -1 ? value.length : nlIdx;
    const block = value.slice(lineStart, lineEnd);
    const lines = block.split('\n');
    let num = 1;
    const newLines = lines.map((line) => {
      const stripped = line.replace(/^(#{1,2}\s|-\s|\d+\.\s)/, '');
      switch (mode) {
        case 'large': return `# ${stripped}`;
        case 'medium': return `## ${stripped}`;
        case 'normal': return stripped;
        case 'bullet': return `- ${stripped}`;
        case 'number': return `${num++}. ${stripped}`;
      }
    });
    const newBlock = newLines.join('\n');
    const next = value.slice(0, lineStart) + newBlock + value.slice(lineEnd);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(lineStart, lineStart + newBlock.length);
    });
  }

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        <ToolbarButton label="大字" title="這幾行改成大字" onClick={() => applyLineMode('large')} />
        <ToolbarButton label="中字" title="這幾行改成中字" onClick={() => applyLineMode('medium')} />
        <ToolbarButton label="小字" title="這幾行改回預設大小" onClick={() => applyLineMode('normal')} />
        <span style={{ width: 1, height: 18, background: 'rgba(255,255,255,.14)' }} />
        <ToolbarButton label="B" title="粗體選取文字" bold onClick={() => applyInline('**', '**')} />
        <span style={{ width: 1, height: 18, background: 'rgba(255,255,255,.14)' }} />
        <ToolbarButton label="• 列點" title="這幾行改成項目清單" onClick={() => applyLineMode('bullet')} />
        <ToolbarButton label="1. 編號" title="這幾行改成編號清單" onClick={() => applyLineMode('number')} />
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className="nm-input w-full text-[15.5px] leading-[1.7]"
        style={{ resize: 'vertical', minHeight: 220 }}
      />
    </div>
  );
}
