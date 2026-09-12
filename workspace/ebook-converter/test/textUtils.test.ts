import { describe, it, expect } from 'vitest';
import {
  bookFromText,
  bookToText,
  splitChapters,
  textToParagraphs,
} from '../src/core/textUtils';

describe('textUtils', () => {
  it('归一化换行并拆分段落', () => {
    expect(textToParagraphs('a\r\nb\r\n\r\n第二段落')).toEqual(['ab', '第二段落']);
  });

  it('识别中文章节标题', () => {
    const paras = [
      '前言内容，这是序章的一段文字内容。',
      '第一章 初入江湖',
      '这是第一章的正文内容。',
      '第二章 风云再起',
      '第二章正文，比较长。'.repeat(3),
    ];
    const chapters = splitChapters(paras);
    expect(chapters.length).toBe(3);
    expect(chapters[0].title).toBe('正文');
    expect(chapters[1].title).toBe('第一章 初入江湖');
    expect(chapters[2].title).toBe('第二章 风云再起');
  });

  it('识别 Chapter N 与"第123节"', () => {
    const chapters = splitChapters([
      'Chapter 1 The Beginning',
      'body1',
      '第123节 尾声',
      'body2',
    ]);
    expect(chapters[0].title).toBe('Chapter 1 The Beginning');
    expect(chapters[1].title).toBe('第123节 尾声');
  });

  it('普通短行不会被误判为章节', () => {
    const chapters = splitChapters(['你好', '这是一段普通对话，不会被当成章节标题的哦。']);
    expect(chapters.length).toBe(1);
  });

  it('bookFromText / bookToText 往返', () => {
    const book = bookFromText('书名测试\n\n第一章 开始\n\n正文第一段。\n\n正文第二段。', '测试书');
    expect(book.title).toBe('测试书');
    expect(book.chapters[0].paragraphs.length).toBeGreaterThan(0);
    const text = bookToText(book);
    expect(text).toContain('正文第一段');
    expect(text).toContain('第一章 开始');
  });
});
