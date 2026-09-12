/**
 * 全矩阵转换冒烟（Node 环境）：
 * 用 TXT 生成 EPUB/DOCX 作为“真实源文件”，再验证所有 12 个合法组合。
 * 用法：npx tsx scripts/matrix-smoke.ts
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import iconv from 'iconv-lite';

// ---- 浏览器 API polyfill（转换库依赖）----
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.DOMParser = dom.window.DOMParser;
// pdfjs legacy 需要
if (!('atob' in globalThis)) globalThis.atob = (s: string) => Buffer.from(s, 'base64').toString('binary');
if (!('btoa' in globalThis)) globalThis.btoa = (s: string) => Buffer.from(s, 'binary').toString('base64');

const FONT = await readFile(join(import.meta.dirname, '../public/fonts/DroidSansFallback.ttf'));
const GBK_B64 = await readFile(join(import.meta.dirname, '../public/data/gbk-encode.txt'), 'utf8');
globalThis.fetch = (async (input: unknown) => {
  const url = String(input);
  if (url.endsWith('.ttf')) {
    return { ok: true, status: 200, arrayBuffer: async () => FONT.buffer.slice(FONT.byteOffset, FONT.byteOffset + FONT.byteLength) };
  }
  if (url.endsWith('gbk-encode.txt')) {
    return { ok: true, status: 200, text: async () => GBK_B64.trim() };
  }
  throw new Error('unexpected fetch ' + url);
}) as typeof fetch;

const { convert } = await import('../src/core/converter');
const { parseEpub } = await import('../src/core/parseEpub');
const { parseDocx } = await import('../src/core/parseDocx');
const { parsePdf } = await import('../src/core/parsePdf');

const SAMPLE = [
  '矩阵测试',
  '',
  '第一章 开始',
  '',
  '这是一段中文正文内容，包含标点符号与 English words、数字 123。',
  '',
  '第二章 结束',
  '',
  '最后一段正文，用于验证往返转换后的可读性。',
].join('\n');

const ctrl = new AbortController();
function toFile(name: string, bytes: Uint8Array, mime = 'application/octet-stream'): File {
  return new File([bytes as unknown as BlobPart], name, { type: mime });
}

async function toTarget(sourceName: string, bytes: Uint8Array, source: string, target: string) {
  return convert({
    file: toFile(sourceName, bytes),
    source: source as never,
    target: target as never,
    outputName: 'matrix',
    txtEncoding: target === 'txt' ? 'utf-8' : 'utf-8',
    signal: ctrl.signal,
  });
}

// 1) TXT 为源，产出 epub/docx/pdf/txt
const txtBytes = new TextEncoder().encode(SAMPLE);
await mkdir(join(import.meta.dirname, '../.smoke-out'), { recursive: true });
const made: Record<string, Uint8Array> = { txt: txtBytes };

console.log('== 第一轮：TXT → 其他 ==');
for (const t of ['epub', 'docx', 'pdf', 'txt'] as const) {
  const r = await toTarget('book.txt', txtBytes, 'txt', t);
  made[t] = r.built.bytes;
  await writeFile(join(import.meta.dirname, `../.smoke-out/from-txt.${t}`), r.built.bytes);
  console.log(`  TXT -> ${t.toUpperCase()}: ${r.built.bytes.length} bytes  ${r.outputName}`);
}

// 2) 每种格式为源 → 其余三种
console.log('== 全矩阵互转 ==');
let fail = 0;
for (const s of ['epub', 'docx', 'pdf'] as const) {
  for (const t of ['txt', 'epub', 'docx', 'pdf'] as const) {
    if (s === t) continue;
    try {
      const r = await toTarget(`book.${s}`, made[s], s, t);
      console.log(`  ${s.toUpperCase()} -> ${t.toUpperCase()}: ${r.built.bytes.length} bytes  ✓`);
    } catch (e) {
      fail++;
      console.error(`  ${s.toUpperCase()} -> ${t.toUpperCase()}: 失败 ${(e as Error).message}`);
    }
  }
}

// 3) 内容往返可读性：epub/docx/pdf → txt
console.log('== 提取可读性验证 ==');
const checks: Array<[string, () => Promise<string>]> = [
  ['EPUB→TXT 含中文', async () => {
    const r = await toTarget('b.epub', made.epub, 'epub', 'txt');
    return new TextDecoder().decode(r.built.bytes);
  }],
  ['DOCX→TXT 含中文', async () => {
    const r = await toTarget('b.docx', made.docx, 'docx', 'txt');
    return new TextDecoder().decode(r.built.bytes);
  }],
  ['PDF→TXT 含中文', async () => {
    const r = await toTarget('b.pdf', made.pdf, 'pdf', 'txt');
    return new TextDecoder().decode(r.built.bytes);
  }],
];
for (const [name, fn] of checks) {
  const text = await fn();
  const ok = text.includes('正文') || text.includes('矩阵') || text.includes('最后');
  console.log(`  ${name}: ${ok ? '✓' : '✗'}`);
  if (!ok) {
    fail++;
    console.log('    片段:', text.slice(0, 80).replace(/\n/g, ' '));
  }
}

// 4) GBK 输出往返
console.log('== GBK 输出 ==');
{
  const r = await convert({
    file: toFile('b.txt', txtBytes),
    source: 'txt',
    target: 'txt',
    outputName: 'g',
    txtEncoding: 'gbk',
    signal: ctrl.signal,
  });
  const back = iconv.decode(Buffer.from(r.built.bytes), 'gbk');
  const ok = back.includes('中文正文');
  console.log(`  TXT(UTF-8) → TXT(GBK): ${ok ? '✓' : '✗'}`);
  if (!ok) fail++;
}

if (fail) {
  console.error(`\n${fail} 项失败`);
  process.exit(1);
}
console.log('\n全部矩阵转换通过');
