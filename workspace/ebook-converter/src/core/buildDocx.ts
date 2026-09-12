import { FORMAT_MIMES } from './formats';
import type { Book, BuiltFile, ConvertOptions } from './types';

export async function buildDocx(book: Book, opts: ConvertOptions): Promise<BuiltFile> {
  const {
    AlignmentType,
    Document,
    HeadingLevel,
    Packer,
    Paragraph,
    TextRun,
  } = await import('docx');

  const children: import('docx').Paragraph[] = [];

  // 封面标题
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 2400, after: 400 },
      children: [new TextRun({ text: book.title, bold: true, size: 56 })],
    }),
  );

  const total = book.chapters.length;
  let done = 0;
  for (const ch of book.chapters) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: true,
        spacing: { after: 240 },
        children: [new TextRun({ text: ch.title, bold: true, size: 32 })],
      }),
    );
    for (const p of ch.paragraphs) {
      opts.signal.throwIfAborted();
      children.push(
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          indent: { firstLine: 480 },
          spacing: { line: 360, after: 120 },
          children: [new TextRun({ text: p, size: 24 })],
        }),
      );
    }
    done += 1;
    opts.onProgress?.(0.6 + (0.25 * done) / Math.max(total, 1), '正在生成 DOCX');
  }

  const doc = new Document({
    creator: '电子书格式转换器',
    title: book.title,
    styles: {
      default: {
        document: {
          run: { font: { ascii: 'Times New Roman', eastAsia: 'SimSun' }, size: 24 },
        },
      },
    },
    sections: [{ properties: {}, children }],
  });

  opts.onProgress?.(0.88, '正在打包 DOCX');
  if (typeof document === 'undefined') {
    const buffer = (await Packer.toBuffer(doc)) as unknown as ArrayBuffer;
    return {
      bytes: new Uint8Array(buffer),
      mime: FORMAT_MIMES.docx,
      extension: 'docx',
    };
  }
  const blob = await Packer.toBlob(doc);
  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    mime: FORMAT_MIMES.docx,
    extension: 'docx',
  };
}
