import JSZip from 'jszip';
import { FORMAT_MIMES } from './formats';
import type { Book, BuiltFile, ConvertOptions } from './types';

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function chapterHtml(book: Book, index: number): string {
  const ch = book.chapters[index];
  const paras = ch.paragraphs
    .map((p) => `<p>${escapeXml(p)}</p>`)
    .join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-CN" lang="zh-CN">
<head><title>${escapeXml(ch.title)}</title></head>
<body>
<h2>${escapeXml(ch.title)}</h2>
${paras}
</body>
</html>`;
}

export async function buildEpub(book: Book, opts: ConvertOptions): Promise<BuiltFile> {
  const title = opts.epubTitle?.trim() || book.title;
  const uid = 'urn:uuid:' + (crypto.randomUUID?.() ?? createUuid());
  const date = new Date().toISOString();
  const n = book.chapters.length;

  const manifestChapters = book.chapters
    .map(
      (_, i) =>
        `    <item id="chap${i}" href="chapter${i}.xhtml" media-type="application/xhtml+xml"/>`,
    )
    .join('\n');
  const spineChapters = book.chapters
    .map((_, i) => `    <itemref idref="chap${i}"/>`)
    .join('\n');
  const navList = book.chapters
    .map(
      (c, i) =>
        `      <li><a href="chapter${i}.xhtml">${escapeXml(c.title)}</a></li>`,
    )
    .join('\n');

  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="zh-CN">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${escapeXml(uid)}</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:language>zh-CN</dc:language>
    <meta property="dcterms:modified">${date}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
${manifestChapters}
  </manifest>
  <spine>
${spineChapters}
  </spine>
</package>`;

  const nav = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="zh-CN">
<head><title>${escapeXml(title)}</title></head>
<body>
<nav epub:type="toc">
  <h1>${escapeXml(title)}</h1>
  <ol>
${navList}
  </ol>
</nav>
</body>
</html>`;

  const container = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

  const zip = new JSZip();
  // mimetype 必须是第一个文件且不压缩
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.folder('META-INF')!.file('container.xml', container);
  const oebps = zip.folder('OEBPS')!;
  oebps.file('content.opf', opf);
  oebps.file('nav.xhtml', nav);
  for (let i = 0; i < n; i++) {
    opts.signal.throwIfAborted();
    oebps.file(`chapter${i}.xhtml`, chapterHtml(book, i));
    opts.onProgress?.(0.55 + (0.25 * (i + 1)) / Math.max(n, 1), '正在生成 EPUB');
  }

  const out = await zip.generateAsync(
    {
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
      mimeType: 'application/epub+zip',
    },
    (meta) => {
      if (meta.percent !== undefined) {
        opts.onProgress?.(0.8 + meta.percent / 500, '正在压缩 EPUB');
      }
    },
  );
  return { bytes: out, mime: FORMAT_MIMES.epub, extension: 'epub' };
}

function createUuid(): string {
  // crypto.randomUUID 不可用时的兜底
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
