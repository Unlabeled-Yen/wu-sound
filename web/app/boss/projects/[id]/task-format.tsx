import type { ReactNode } from 'react';

// 備忘欄位的極簡格式語法——不是完整 markdown,只支援這個面板工具列會用到的
// 幾種標記,夠打字規劃用就好:
//   # 內容    → 大字(標題感)
//   ## 內容   → 中字
//   (無標記)  → 小字(內文,跟原本沒改版前一樣大)
//   **內容**  → 粗體(行內)
//   - 內容    → 項目清單
//   1. 內容   → 編號清單(顯示時依實際順序重新編號,不管使用者打的數字對不對)

function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*.+?\*\*)/g);
  return parts
    .map((part, idx) => {
      const m = /^\*\*(.+)\*\*$/.exec(part);
      if (m) return <strong key={idx}>{m[1]}</strong>;
      return part ? <span key={idx}>{part}</span> : null;
    })
    .filter(Boolean);
}

export function renderTaskTitle(text: string): ReactNode {
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^-\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^-\s/.test(lines[i])) {
        items.push(lines[i].replace(/^-\s/, ''));
        i++;
      }
      blocks.push(
        <ul key={key++} style={{ margin: '2px 0', paddingLeft: 18, listStyle: 'disc' }}>
          {items.map((it, idx) => (
            <li key={idx} style={{ marginBottom: 1 }}>{renderInline(it)}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ''));
        i++;
      }
      blocks.push(
        <ol key={key++} style={{ margin: '2px 0', paddingLeft: 18 }}>
          {items.map((it, idx) => (
            <li key={idx} style={{ marginBottom: 1 }}>{renderInline(it)}</li>
          ))}
        </ol>
      );
      continue;
    }

    let size: 'large' | 'medium' | 'normal' = 'normal';
    let content = line;
    if (/^##\s/.test(line)) {
      size = 'medium';
      content = line.replace(/^##\s/, '');
    } else if (/^#\s/.test(line)) {
      size = 'large';
      content = line.replace(/^#\s/, '');
    }

    if (content.trim() === '') {
      blocks.push(<div key={key++} style={{ height: 6 }} />);
    } else {
      const fontSize = size === 'large' ? 17 : size === 'medium' ? 15 : 13;
      const fontWeight = size === 'normal' ? 400 : 600;
      blocks.push(
        <div key={key++} style={{ font: `${fontWeight} ${fontSize}px/1.5 "Noto Sans TC",sans-serif` }}>
          {renderInline(content)}
        </div>
      );
    }
    i++;
  }

  return blocks;
}
