import type { Book, Chapter } from './types';

/** 统一换行并拆分为非空段落，同时合并 PDF 提取产生的断行 */
export function textToParagraphs(raw: string): string[] {
  return normalizeText(raw)
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, '').trim())
    .filter(Boolean);
}

/** 保留段落（空行分段），段落内部不合并换行（TXT 原文可能本就如此） */
export function textToParagraphsPreserveBreaks(raw: string): string[] {
  return normalizeText(raw)
    .split(/\n[ \t]*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function normalizeText(raw: string): string {
  return raw
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+\n/g, '\n');
}

/**
 * 识别中文小说常见的章节标题：
 * 第X章 / 第X节 / Chapter N（独占一行）
 */
const CHAPTER_RE =
  /^\s*(?:第\s*[0-9零一二三四五六七八九十百千万两]+\s*[章卷节回篇]|chapter\s+\d+|[0-9]+[、.．])[\s:：、.．]?.{0,40}$/i;

export function splitChapters(paragraphs: string[], fallbackTitle = '正文'): Chapter[] {
  const chapters: Chapter[] = [];
  let current: Chapter = { title: fallbackTitle, paragraphs: [] };

  for (const p of paragraphs) {
    const oneLine = p.replace(/\n/g, ' ').trim();
    if (oneLine.length <= 40 && CHAPTER_RE.test(oneLine)) {
      if (current.paragraphs.length || chapters.length === 0) {
        if (current.paragraphs.length) chapters.push(current);
        current = { title: oneLine, paragraphs: [] };
        continue;
      }
    }
    current.paragraphs.push(p);
  }
  if (current.paragraphs.length || chapters.length === 0) chapters.push(current);
  return chapters.filter((c) => c.paragraphs.length || c.title !== fallbackTitle);
}

export function bookFromText(text: string, title: string): Book {
  const paragraphs = textToParagraphsPreserveBreaks(text);
  return { title, chapters: splitChapters(paragraphs) };
}

export function bookFromParagraphs(paragraphs: string[], title: string): Book {
  return { title, chapters: splitChapters(paragraphs) };
}

/** Book 展平为纯文本（段落用空行分隔） */
export function bookToText(book: Book): string {
  const parts: string[] = [];
  for (const ch of book.chapters) {
    parts.push(ch.title);
    parts.push(...ch.paragraphs);
  }
  return parts.join('\n\n');
}
