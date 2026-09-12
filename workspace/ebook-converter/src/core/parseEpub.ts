import JSZip from 'jszip';
import { bookFromParagraphs } from './textUtils';
import { stripExtension } from './formats';
import type { Book } from './types';

interface SpineItem {
  href: string;
  id?: string;
}

/** 解析 EPUB 2/3：按 spine 顺序读取各 XHTML 内容文件并提取段落 */
export async function parseEpub(file: File, signal?: AbortSignal): Promise<Book> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  signal?.throwIfAborted();

  const container = zip.file('META-INF/container.xml');
  if (!container) throw new Error('不是有效的 EPUB：缺少 container.xml');
  const containerXml = await container.async('string');
  const rootPath =
    containerXml.match(/full-path="([^"]+)"/)?.[1] ?? 'OEBPS/content.opf';
  const rootDir = rootPath.includes('/')
    ? rootPath.slice(0, rootPath.lastIndexOf('/') + 1)
    : '';

  const opfFile = zip.file(rootPath);
  if (!opfFile) throw new Error('不是有效的 EPUB：缺少 OPF 文件');
  const opfXml = await opfFile.async('string');
  const opf = new DOMParser().parseFromString(opfXml, 'application/xml');

  const dcTitle =
    opf.getElementsByTagName('dc:title')[0]?.textContent?.trim() ||
    opf.getElementsByTagName('title')[0]?.textContent?.trim() ||
    stripExtension(file.name);

  // manifest: id -> href
  const manifest = new Map<string, string>();
  const items = opf.getElementsByTagName('item');
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const id = it.getAttribute('id');
    const href = it.getAttribute('href');
    if (id && href) manifest.set(id, decodeURIComponent(href));
  }

  // spine 顺序
  const spine: SpineItem[] = [];
  const refs = opf.getElementsByTagName('itemref');
  for (let i = 0; i < refs.length; i++) {
    const idref = refs[i].getAttribute('idref');
    if (idref && manifest.has(idref)) {
      spine.push({ href: manifest.get(idref)!, id: idref });
    }
  }
  if (spine.length === 0) throw new Error('EPUB 中没有可读取的章节');

  const BLOCK_SEL = 'h1,h2,h3,h4,h5,h6,p,li,blockquote,dt,dd';
  const allParagraphs: string[] = [];
  for (let i = 0; i < spine.length; i++) {
    signal?.throwIfAborted();
    const fullPath = normalizePath(rootDir + spine[i].href);
    const contentFile = zip.file(fullPath);
    if (!contentFile) continue;
    const html = await contentFile.async('string');
    const doc = new DOMParser().parseFromString(html, 'application/xhtml+xml');
    const body = doc.body ?? doc.getElementsByTagName('body')[0];
    if (!body) continue;

    const blocks = body.querySelectorAll(BLOCK_SEL);
    blocks.forEach((el) => {
      // 跳过内部还嵌套其他块元素的容器，避免重复
      if (el.querySelector(BLOCK_SEL)) return;
      const text = (el.textContent ?? '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
      if (text) allParagraphs.push(text);
    });
  }

  const realParas = allParagraphs;
  if (realParas.length === 0) throw new Error('EPUB 中未提取到文字');

  return bookFromParagraphs(allParagraphs, dcTitle);
}

function normalizePath(p: string): string {
  const parts: string[] = [];
  for (const seg of p.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}
