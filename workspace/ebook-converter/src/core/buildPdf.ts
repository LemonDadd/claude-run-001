import { FORMAT_MIMES } from './formats';
import { loadCjkFont, FONT_FAMILY, FONT_FILE } from './pdfFont';
import type { jsPDF } from 'jspdf';
import type { Book, BuiltFile, ConvertOptions } from './types';

// A4: 210×297mm
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN_X = 20;
const MARGIN_TOP = 22;
const MARGIN_BOTTOM = 22;
const CONTENT_W = PAGE_W - MARGIN_X * 2;
const BODY_SIZE = 12;
const TITLE_SIZE = 22;
const HEADING_SIZE = 16;
const LINE_GAP = 7;
const LATIN_FONT = 'times';

function isWideChar(cp: number): boolean {
  return (
    (cp >= 0x2e80 && cp <= 0x9fff) || // CJK 部首/汉字
    (cp >= 0xff00 && cp <= 0xffef) || // 全角符号
    (cp >= 0x3000 && cp <= 0x303f) || // CJK 标点
    (cp >= 0xac00 && cp <= 0xd7af) // 韩文音节
  );
}

interface Segment {
  text: string;
  cjk: boolean;
}

/** 按 CJK / 非 CJK 切段，便于切换嵌入字体与内置字体 */
function segmentize(text: string): Segment[] {
  const segs: Segment[] = [];
  let cur = '';
  let curCjk = text.length > 0 ? isWideChar(text.codePointAt(0)!) : false;
  for (const ch of text) {
    const cjk = isWideChar(ch.codePointAt(0)!);
    if (cjk === curCjk) {
      cur += ch;
    } else {
      if (cur) segs.push({ text: cur, cjk: curCjk });
      cur = ch;
      curCjk = cjk;
    }
  }
  if (cur) segs.push({ text: cur, cjk: curCjk });
  return segs;
}

interface Frag {
  text: string;
  cjk: boolean;
  width: number;
}

/**
 * 贪心折行：
 * - CJK 段逐字符折断；
 * - 拉丁段按词（连续空白或单词）折断。
 */
function layoutLine(doc: jsPDF, segments: Segment[], maxWidth: number): Frag[][] {
  const lines: Frag[][] = [[]];
  let width = 0;

  const pushFrag = (frag: Frag) => {
    if (width + frag.width > maxWidth && lines[lines.length - 1].length > 0) {
      lines.push([]);
      width = 0;
    }
    lines[lines.length - 1].push(frag);
    width += frag.width;
  };

  for (const seg of segments) {
    if (seg.cjk) {
      for (const ch of seg.text) {
        doc.setFont(FONT_FAMILY, 'normal');
        pushFrag({ text: ch, cjk: true, width: doc.getTextWidth(ch) });
      }
    } else {
      const tokens = seg.text.match(/\s+|\S+/g) ?? [];
      for (const tok of tokens) {
        doc.setFont(LATIN_FONT, 'normal');
        pushFrag({ text: tok, cjk: false, width: doc.getTextWidth(tok) });
      }
    }
  }
  return lines;
}

export async function buildPdf(book: Book, opts: ConvertOptions): Promise<BuiltFile> {
  opts.onProgress?.(0.58, '正在加载中文字体');
  const [fontBase64, { jsPDF: JsPDF }] = await Promise.all([
    loadCjkFont(),
    import('jspdf'),
  ]);
  opts.signal.throwIfAborted();

  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  doc.addFileToVFS(FONT_FILE, fontBase64);
  doc.addFont(FONT_FILE, FONT_FAMILY, 'normal');

  let y = MARGIN_TOP;

  const ensureSpace = () => {
    if (y + LINE_GAP > PAGE_H - MARGIN_BOTTOM) {
      doc.addPage();
      y = MARGIN_TOP;
    }
  };

  const drawFragments = (frags: Frag[], center = false) => {
    let x = MARGIN_X;
    if (center) {
      const total = frags.reduce((s, f) => s + f.width, 0);
      x = (PAGE_W - total) / 2;
    }
    for (const f of frags) {
      doc.setFont(f.cjk ? FONT_FAMILY : LATIN_FONT, 'normal');
      doc.text(f.text, x, y);
      x += f.width;
    }
  };

  const drawBlock = (text: string, size: number, gapAfter: number) => {
    doc.setFontSize(size);
    const lines = layoutLine(doc, segmentize(text), CONTENT_W);
    for (const frags of lines) {
      ensureSpace();
      drawFragments(frags);
      y += LINE_GAP;
    }
    y += gapAfter;
  };

  // 进度
  let workDone = 0;
  const totalWork = Math.max(
    book.chapters.reduce(
      (n, c) => n + c.paragraphs.reduce((m, p) => m + p.length, 0),
      0,
    ),
    1,
  );
  const tick = () =>
    opts.onProgress?.(0.62 + 0.33 * Math.min(workDone / totalWork, 1), '正在排版 PDF');

  // 封面
  doc.setFontSize(TITLE_SIZE);
  {
    const titleLines = layoutLine(doc, segmentize(book.title || '未命名'), CONTENT_W);
    y = PAGE_H / 2 - titleLines.length * 5;
    for (const frags of titleLines) {
      drawFragments(frags, true);
      y += LINE_GAP + 3;
    }
  }

  // 章节正文
  for (const ch of book.chapters) {
    opts.signal.throwIfAborted();
    doc.addPage();
    y = MARGIN_TOP;
    drawBlock(ch.title, HEADING_SIZE, 5);
    for (const para of ch.paragraphs) {
      // 两个全角空格形成首行缩进
      drawBlock('　　' + para, BODY_SIZE, 2);
      workDone += para.length;
      if ((workDone & 255) === 0) tick();
    }
    tick();
  }

  opts.signal.throwIfAborted();
  opts.onProgress?.(0.96, '正在生成 PDF');
  const arrayBuffer = doc.output('arraybuffer');
  return {
    bytes: new Uint8Array(arrayBuffer),
    mime: FORMAT_MIMES.pdf,
    extension: 'pdf',
  }
}
