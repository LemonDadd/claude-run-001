// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import iconv from 'iconv-lite';
import { convert } from '../src/core/converter';
import { parseEpub } from '../src/core/parseEpub';
import { loadHistory, addHistory, clearHistory } from '../src/core/history';
import type { Format, TxtEncoding } from '../src/core/types';

const here = dirname(fileURLToPath(import.meta.url));
const FONT = readFileSync(join(here, '../public/fonts/DroidSansFallback.ttf'));
const GBK_TABLE_B64 = readFileSync(join(here, '../public/data/gbk-encode.txt'), 'utf8').trim();

const realFetch = globalThis.fetch;
function fakeResponse(body: ArrayBuffer, extra: { text?: () => Promise<string> } = {}) {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => body,
    text: extra.text ?? (async () => new TextDecoder().decode(body)),
  };
}
async function fakeFetch(input: RequestInfo | URL, _init?: RequestInit) {
  const url = String(input);
  if (url.endsWith('/fonts/DroidSansFallback.ttf')) {
    return fakeResponse(FONT.buffer.slice(FONT.byteOffset, FONT.byteOffset + FONT.byteLength));
  }
  if (url.endsWith('/data/gbk-encode.txt')) {
    const b64 = GBK_TABLE_B64;
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => new TextEncoder().encode(b64).buffer,
      text: async () => b64,
    };
  }
  return realFetch(input as Parameters<typeof fetch>[0], _init);
}

const SAMPLE = [
  '三体（节选）',
  '',
  '第一章 科学边界',
  '',
  '汪淼觉得，找他来的警官是个老警察。',
  '',
  '第二章 台球',
  '',
  '丁仪把黑白两个球摆在桌子上，拿起球杆轻轻一击。',
].join('\n');

function makeFile(name: string, content: string | Uint8Array, mime = 'text/plain'): File {
  const data = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  return new File([data as unknown as BlobPart], name, { type: mime });
}

async function runConvert(
  file: File,
  source: Format,
  target: Format,
  extra: { txtEncoding?: TxtEncoding; epubTitle?: string } = {},
) {
  const ctrl = new AbortController();
  return convert({
    file,
    source,
    target,
    outputName: 'out',
    txtEncoding: extra.txtEncoding ?? 'utf-8',
    epubTitle: extra.epubTitle,
    signal: ctrl.signal,
  });
}

describe('端到端转换', () => {
  beforeAll(() => {
    // buildPdf/buildTxt 通过 fetch 加载字体与 GBK 码表，测试里返回本地文件
    globalThis.fetch = fakeFetch as unknown as typeof fetch;
  });

  it('TXT → EPUB：结构合法且可被自己的解析器读回', async () => {
    const src = makeFile('santi.txt', SAMPLE);
    const { built, outputName } = await runConvert(src, 'txt', 'epub', { epubTitle: '自定义书名' });
    expect(outputName).toBe('out.epub');
    expect(built.extension).toBe('epub');

    // mimetype 必须为首项且不压缩：ZIP 本地头长度 30 + 文件名 mimetype
    const zipHead = new TextDecoder('latin1').decode(built.bytes.slice(0, 60));
    expect(zipHead).toContain('mimetypeapplication/epub+zip');

    const roundtrip = await parseEpub(new File([built.bytes as unknown as BlobPart], 'out.epub'));
    expect(roundtrip.title).toBe('自定义书名');
    const allText = roundtrip.chapters.map((c) => c.paragraphs.join('')).join('');
    expect(allText).toContain('汪淼觉得');
    expect(allText).toContain('丁仪把黑白两个球');
  });

  it('TXT → DOCX：mammoth 可读回正文', async () => {
    const src = makeFile('santi.txt', SAMPLE);
    const { built } = await runConvert(src, 'txt', 'docx');
    expect(built.extension).toBe('docx');
    const mammoth = (await import('mammoth/lib/index.js')).default ??
      await import('mammoth/lib/index.js');
    const res = await mammoth.extractRawText({
      buffer: Buffer.from(built.bytes),
    });
    expect(res.value).toContain('汪淼觉得');
    expect(res.value).toContain('第一章 科学边界');
  });

  it('TXT(UTF-8) → TXT(GBK)：字节可被 GBK 正确解码', async () => {
    const src = makeFile('santi.txt', SAMPLE);
    const { built } = await runConvert(src, 'txt', 'txt', { txtEncoding: 'gbk' });
    expect(built.bytes[0]).not.toBe(0xef); // 无 UTF-8 BOM
    const decoded = iconv.decode(Buffer.from(built.bytes), 'gbk');
    expect(decoded).toContain('汪淼觉得');
    expect(decoded).toContain('丁仪');
  });

  it('TXT → TXT(UTF-8)：带 BOM 且内容一致', async () => {
    const src = makeFile('santi.txt', SAMPLE);
    const { built } = await runConvert(src, 'txt', 'txt');
    expect(built.bytes.slice(0, 3)).toEqual(new Uint8Array([0xef, 0xbb, 0xbf]));
    const decoded = new TextDecoder().decode(built.bytes.slice(3));
    expect(decoded).toContain('科学边界');
  });

  it('TXT(GBK 源) → TXT(UTF-8)：输入编码自动检测', async () => {
    const gbkBytes = iconv.encode('第一章 编码\n\n这是 GBK 编码的中文内容。', 'gbk');
    const src = makeFile('gbk.txt', new Uint8Array(gbkBytes));
    const { built } = await runConvert(src, 'txt', 'txt');
    const decoded = new TextDecoder().decode(built.bytes);
    expect(decoded).toContain('这是 GBK 编码的中文内容');
  });

  it('TXT → PDF：生成 %PDF 头且可被 pdf.js 打开', async () => {
    const src = makeFile('santi.txt', SAMPLE);
    const { built } = await runConvert(src, 'txt', 'pdf');
    expect(built.extension).toBe('pdf');
    expect(new TextDecoder().decode(built.bytes.slice(0, 5))).toBe('%PDF-');

    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const fontPath = join(here, '../node_modules/pdfjs-dist/standard_fonts/');
    const pdf = await pdfjs.getDocument({
      data: built.bytes.slice(),
      isEvalSupported: false,
      standardFontDataUrl: 'file://' + fontPath,
    }).promise;
    expect(pdf.numPages).toBeGreaterThanOrEqual(2);
    let allText = '';
    for (let n = 1; n <= pdf.numPages; n++) {
      const p = await pdf.getPage(n);
      const c = await p.getTextContent();
      allText += c.items.map((i) => ('str' in i ? i.str : '')).join('');
    }
    expect(allText).toContain('三体');
    expect(allText).toContain('汪淼觉得');
  });
});

describe('取消转换', () => {
  beforeAll(() => {
    globalThis.fetch = fakeFetch as unknown as typeof fetch;
  });

  it('已取消的信号应中断 EPUB 构建', async () => {
    const src = makeFile('s.txt', SAMPLE);
    const ctrl = new AbortController();
    const p = convert({
      file: src,
      source: 'txt',
      target: 'epub',
      outputName: 'out',
      txtEncoding: 'utf-8',
      signal: ctrl.signal,
    });
    ctrl.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('历史记录', () => {
  it('最多保留 20 条且最新在前', () => {
    clearHistory();
    for (let i = 0; i < 25; i++) {
      addHistory({ name: `f${i}.txt`, path: `来源 s${i}.txt`, status: 'success' });
    }
    const list = loadHistory();
    expect(list).toHaveLength(20);
    expect(list[0].name).toBe('f24.txt');
    expect(list[19].name).toBe('f5.txt');
  });

  it('记录失败状态与错误摘要', () => {
    clearHistory();
    addHistory({ name: 'x.epub', path: '来源 a.pdf', status: 'failed', error: 'PDF 中未提取到文字' });
    const list = loadHistory();
    expect(list[0].status).toBe('failed');
    expect(list[0].error).toContain('未提取到文字');
    clearHistory();
  });
});
