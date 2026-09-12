import { describe, it, expect } from 'vitest';
import {
  detectFormat,
  formatFromName,
  legalTargets,
  sanitizeName,
  stripExtension,
} from '../src/core/formats';

describe('formats', () => {
  it('扩展名映射', () => {
    expect(formatFromName('a.txt')).toBe('txt');
    expect(formatFromName('book.epub')).toBe('epub');
    expect(formatFromName('x.DOCX')).toBe('docx');
    expect(formatFromName('x.pdf')).toBe('pdf');
    expect(formatFromName('x.azw3')).toBeNull();
  });

  it('合法目标：排除自身，其余三种都在', () => {
    expect(legalTargets('txt').sort()).toEqual(['docx', 'epub', 'pdf']);
    expect(legalTargets('pdf')).not.toContain('pdf');
    expect(legalTargets('epub')).toHaveLength(3);
  });

  it('魔数识别 PDF / ZIP 容器', async () => {
    const pdf = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])], 'fake.txt');
    expect(await detectFormat(pdf)).toBe('pdf');

    // 非已知魔数时回退扩展名
    const txt = new File(['hello world 纯文本'], 'hello.txt');
    expect(await detectFormat(txt)).toBe('txt');
  });

  it('文件名处理', () => {
    expect(stripExtension('my.book.epub')).toBe('my.book');
    expect(sanitizeName('a/b\\c:d*?')).toBe('abcd');
    expect(sanitizeName('   ')).toBe('converted');
  });
});
