import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderTaskTitle } from '../task-format';

function html(text: string): string {
  return renderToStaticMarkup(<>{renderTaskTitle(text)}</>);
}

describe('renderTaskTitle', () => {
  it('renders plain text as normal-size text', () => {
    const out = html('普通內容');
    expect(out).toContain('普通內容');
    expect(out).toContain('400 13px');
  });

  it('renders # as large text and ## as medium text', () => {
    expect(html('# 大標')).toContain('600 17px');
    expect(html('## 中標')).toContain('600 15px');
  });

  it('renders **bold** as <strong>', () => {
    const out = html('前面**重點**後面');
    expect(out).toContain('<strong>重點</strong>');
    expect(out).toContain('前面');
    expect(out).toContain('後面');
  });

  it('groups consecutive "- " lines into one <ul>', () => {
    const out = html('- 第一項\n- 第二項\n- 第三項');
    expect(out).toContain('<ul');
    expect((out.match(/<ul/g) || []).length).toBe(1);
    expect((out.match(/<li/g) || []).length).toBe(3);
  });

  it('groups consecutive numbered lines into one <ol>, ignoring the typed numbers', () => {
    const out = html('1. 第一步\n1. 第二步\n1. 第三步');
    expect(out).toContain('<ol');
    expect((out.match(/<ol/g) || []).length).toBe(1);
    expect((out.match(/<li/g) || []).length).toBe(3);
  });

  it('separates a list block from surrounding normal lines', () => {
    const out = html('前言\n- 項目A\n- 項目B\n後語');
    expect((out.match(/<ul/g) || []).length).toBe(1);
    expect(out.indexOf('前言')).toBeLessThan(out.indexOf('<ul'));
    expect(out.indexOf('後語')).toBeGreaterThan(out.indexOf('</ul>'));
  });
});
